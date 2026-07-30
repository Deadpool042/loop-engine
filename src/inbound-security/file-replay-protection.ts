import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type {
  InboundReplayProtectionInput,
  InboundReplayProtectionPort,
  InboundReplayProtectionPortResult,
} from "./replay-protection.js";

export const FILE_REPLAY_PROTECTION_SCHEMA_VERSION = 1 as const;

export type FileInboundReplayProtectionOptions = Readonly<{
  directory: string;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidInput(value: InboundReplayProtectionInput): boolean {
  return (
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.evidenceId) &&
    (value.nonce === null || isNonEmptyString(value.nonce)) &&
    isNonEmptyString(value.evaluatedAt) &&
    Number.isFinite(Date.parse(value.evaluatedAt))
  );
}

function replayKey(input: InboundReplayProtectionInput): string {
  const claimIdentity =
    input.nonce === null
      ? `request:${input.requestId}`
      : `nonce:${input.nonce}`;

  return createHash("sha256")
    .update("loop-engine:file-replay-claim:v1\0", "utf8")
    .update(input.evidenceId, "utf8")
    .update("\0", "utf8")
    .update(claimIdentity, "utf8")
    .digest("hex");
}

function unavailable(): InboundReplayProtectionPortResult {
  return Object.freeze({ accepted: false as const, reason: "unavailable" as const });
}

export function createFileInboundReplayProtectionPort(
  options: FileInboundReplayProtectionOptions,
): InboundReplayProtectionPort {
  if (!isNonEmptyString(options.directory)) {
    throw new TypeError("Replay protection directory must be a non-empty string.");
  }

  const directory = resolve(options.directory);

  return Object.freeze({
    check(input: InboundReplayProtectionInput): InboundReplayProtectionPortResult {
      if (!isValidInput(input)) {
        return Object.freeze({ accepted: false as const, reason: "invalid" as const });
      }

      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
      } catch {
        return unavailable();
      }

      const key = replayKey(input);
      const claimPath = join(directory, `${key}.json`);
      let descriptor: number | null = null;

      try {
        descriptor = openSync(claimPath, "wx", 0o600);
        const claim = Object.freeze({
          schemaVersion: FILE_REPLAY_PROTECTION_SCHEMA_VERSION,
          key,
          claimedAt: input.evaluatedAt,
        });
        writeFileSync(descriptor, `${JSON.stringify(claim)}\n`, "utf8");
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = null;
        return Object.freeze({
          accepted: true as const,
          receivedAt: input.evaluatedAt,
        });
      } catch (error) {
        if (descriptor !== null) {
          try {
            closeSync(descriptor);
          } catch {
            // The claim remains fail-closed if the descriptor cannot be closed.
          }
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          return Object.freeze({
            accepted: false as const,
            reason: "replayed" as const,
          });
        }
        return unavailable();
      }
    },
  });
}

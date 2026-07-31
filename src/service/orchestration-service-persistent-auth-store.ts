import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type {
  OrchestrationServiceHmacKeyResolver,
  OrchestrationServiceReplayStore,
} from "./orchestration-service-authentication.js";

export const ORCHESTRATION_SERVICE_HMAC_KEY_STORE_SCHEMA_VERSION = 1 as const;
export const ORCHESTRATION_SERVICE_REPLAY_CLAIM_SCHEMA_VERSION = 1 as const;

export type FileOrchestrationServiceHmacKeyResolverOptions = Readonly<{
  filePath: string;
}>;

export type FileOrchestrationServiceReplayStoreOptions = Readonly<{
  directory: string;
  nowEpochSeconds(): number;
}>;

type HmacKeyStoreDocument = Readonly<{
  schemaVersion: typeof ORCHESTRATION_SERVICE_HMAC_KEY_STORE_SCHEMA_VERSION;
  keys: Readonly<Record<string, string>>;
}>;

type ReplayClaimDocument = Readonly<{
  schemaVersion: typeof ORCHESTRATION_SERVICE_REPLAY_CLAIM_SCHEMA_VERSION;
  key: string;
  expiresAtEpochSeconds: number;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidHmacKeyStoreDocument(
  value: unknown,
): value is HmacKeyStoreDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !==
      ORCHESTRATION_SERVICE_HMAC_KEY_STORE_SCHEMA_VERSION ||
    !isRecord(value.keys)
  ) {
    return false;
  }

  return Object.entries(value.keys).every(
    ([keyId, secret]) => isNonEmptyString(keyId) && isNonEmptyString(secret),
  );
}

function isValidReplayClaimDocument(
  value: unknown,
  expectedKey: string,
): value is ReplayClaimDocument {
  return (
    isRecord(value) &&
    value.schemaVersion === ORCHESTRATION_SERVICE_REPLAY_CLAIM_SCHEMA_VERSION &&
    value.key === expectedKey &&
    typeof value.expiresAtEpochSeconds === "number" &&
    Number.isSafeInteger(value.expiresAtEpochSeconds) &&
    value.expiresAtEpochSeconds >= 0
  );
}

function replayKey(keyId: string, nonce: string): string {
  return createHash("sha256")
    .update("loop-engine:service-auth-replay:v1\0", "utf8")
    .update(keyId, "utf8")
    .update("\0", "utf8")
    .update(nonce, "utf8")
    .digest("hex");
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function readReplayClaim(
  claimPath: string,
  expectedKey: string,
): ReplayClaimDocument | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(claimPath, "utf8"));
    return isValidReplayClaimDocument(parsed, expectedKey) ? parsed : null;
  } catch {
    return null;
  }
}

function createReplayClaim(
  claimPath: string,
  claim: ReplayClaimDocument,
): boolean {
  let descriptor: number | null = null;

  try {
    descriptor = openSync(claimPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(claim)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    return true;
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // A partially written claim remains fail-closed.
      }
    }

    if (isAlreadyExistsError(error)) return false;
    throw error;
  }
}

export function createFileOrchestrationServiceHmacKeyResolver(
  options: FileOrchestrationServiceHmacKeyResolverOptions,
): OrchestrationServiceHmacKeyResolver {
  if (!isNonEmptyString(options.filePath)) {
    throw new TypeError("HMAC key store file path must be a non-empty string.");
  }

  const filePath = resolve(options.filePath);

  return Object.freeze({
    async resolve(keyId: string): Promise<string | null> {
      if (!isNonEmptyString(keyId)) return null;

      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
        if (!isValidHmacKeyStoreDocument(parsed)) return null;
        return parsed.keys[keyId] ?? null;
      } catch {
        return null;
      }
    },
  });
}

export function createFileOrchestrationServiceReplayStore(
  options: FileOrchestrationServiceReplayStoreOptions,
): OrchestrationServiceReplayStore {
  if (!isNonEmptyString(options.directory)) {
    throw new TypeError("Replay store directory must be a non-empty string.");
  }

  if (typeof options.nowEpochSeconds !== "function") {
    throw new TypeError("Replay store clock must be a function.");
  }

  const directory = resolve(options.directory);

  return Object.freeze({
    async consume(
      keyId: string,
      nonce: string,
      expiresAtEpochSeconds: number,
    ): Promise<boolean> {
      if (
        !isNonEmptyString(keyId) ||
        !isNonEmptyString(nonce) ||
        !Number.isSafeInteger(expiresAtEpochSeconds) ||
        expiresAtEpochSeconds < 0
      ) {
        return false;
      }

      let nowEpochSeconds: number;
      try {
        nowEpochSeconds = options.nowEpochSeconds();
      } catch {
        return false;
      }

      if (
        !Number.isSafeInteger(nowEpochSeconds) ||
        nowEpochSeconds < 0 ||
        expiresAtEpochSeconds <= nowEpochSeconds
      ) {
        return false;
      }

      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
      } catch {
        return false;
      }

      const key = replayKey(keyId, nonce);
      const claimPath = join(directory, `${key}.json`);
      const claim = Object.freeze({
        schemaVersion: ORCHESTRATION_SERVICE_REPLAY_CLAIM_SCHEMA_VERSION,
        key,
        expiresAtEpochSeconds,
      });

      try {
        if (createReplayClaim(claimPath, claim)) return true;
      } catch {
        return false;
      }

      const existing = readReplayClaim(claimPath, key);

      // Corrupt or mismatched claims remain fail-closed.
      if (existing === null) return false;
      if (existing.expiresAtEpochSeconds > nowEpochSeconds) return false;

      try {
        unlinkSync(claimPath);
      } catch {
        return false;
      }

      // Multiple processes may race after removing an expired claim.
      // Exclusive creation ensures that only one consumer succeeds.
      try {
        return createReplayClaim(claimPath, claim);
      } catch {
        return false;
      }
    },
  });
}

export function writeFileOrchestrationServiceHmacKeyStore(
  filePath: string,
  keys: Readonly<Record<string, string>>,
): void {
  if (!isNonEmptyString(filePath)) {
    throw new TypeError("HMAC key store file path must be a non-empty string.");
  }

  if (
    !isRecord(keys) ||
    !Object.entries(keys).every(
      ([keyId, secret]) => isNonEmptyString(keyId) && isNonEmptyString(secret),
    )
  ) {
    throw new TypeError(
      "HMAC key store keys and secrets must be non-empty strings.",
    );
  }

  const resolvedFilePath = resolve(filePath);
  const directory = dirname(resolvedFilePath);
  const temporaryPath = join(
    directory,
    `.${createHash("sha256")
      .update(resolvedFilePath, "utf8")
      .update(String(process.pid), "utf8")
      .digest("hex")}.tmp`,
  );

  mkdirSync(directory, { recursive: true, mode: 0o700 });

  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    const document = Object.freeze({
      schemaVersion: ORCHESTRATION_SERVICE_HMAC_KEY_STORE_SCHEMA_VERSION,
      keys: Object.freeze({ ...keys }),
    });
    writeFileSync(descriptor, `${JSON.stringify(document)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    renameSync(temporaryPath, resolvedFilePath);
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original filesystem error.
      }
    }
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not exist.
    }
    throw error;
  }
}

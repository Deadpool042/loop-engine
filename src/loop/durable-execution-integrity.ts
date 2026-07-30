import { createHash, timingSafeEqual } from "node:crypto";

import type { DurableExecutionRecord } from "./durable-execution.js";

export const DURABLE_EXECUTION_FINGERPRINT_ALGORITHM = "sha256" as const;
export type DurableExecutionFingerprint = Readonly<{
  algorithm: typeof DURABLE_EXECUTION_FINGERPRINT_ALGORITHM;
  digest: string;
}>;

export function canonicalizeDurableExecutionRecord(
  record: DurableExecutionRecord,
): string {
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    revision: record.revision,
    idempotencyKey: record.idempotencyKey,
    project: record.project,
    status: record.status,
    attempt: record.attempt,
    leaseOwner: record.leaseOwner,
    leaseExpiresAt: record.leaseExpiresAt,
    cancellationRequested: record.cancellationRequested,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    result: record.result,
    failure: record.failure,
    events: record.events.map((item) => ({
      sequence: item.sequence,
      at: item.at,
      type: item.type,
      owner: item.owner,
    })),
  });
}

export function fingerprintDurableExecutionRecord(
  record: DurableExecutionRecord,
): DurableExecutionFingerprint {
  return Object.freeze({
    algorithm: DURABLE_EXECUTION_FINGERPRINT_ALGORITHM,
    digest: createHash("sha256")
      .update(canonicalizeDurableExecutionRecord(record), "utf8")
      .digest("hex"),
  });
}

export function verifyDurableExecutionFingerprint(
  record: DurableExecutionRecord,
  fingerprint: DurableExecutionFingerprint,
): boolean {
  if (
    fingerprint.algorithm !== DURABLE_EXECUTION_FINGERPRINT_ALGORITHM ||
    !/^[a-f0-9]{64}$/.test(fingerprint.digest)
  ) {
    return false;
  }
  const expected = Buffer.from(
    fingerprintDurableExecutionRecord(record).digest,
    "hex",
  );
  const observed = Buffer.from(fingerprint.digest, "hex");
  return expected.length === observed.length && timingSafeEqual(expected, observed);
}

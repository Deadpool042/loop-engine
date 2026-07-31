import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  DURABLE_EXECUTION_STATUSES,
  type DurableExecutionEvent,
  type DurableExecutionRecord,
} from "./durable-execution.js";
import {
  DURABLE_EXECUTION_FINGERPRINT_ALGORITHM,
  fingerprintDurableExecutionRecord,
  verifyDurableExecutionFingerprint,
  type DurableExecutionFingerprint,
} from "./durable-execution-integrity.js";

export const DURABLE_EXECUTION_ENVELOPE_SCHEMA_VERSION = 1 as const;

export type DurableExecutionEnvelope = Readonly<{
  schemaVersion: typeof DURABLE_EXECUTION_ENVELOPE_SCHEMA_VERSION;
  record: DurableExecutionRecord;
  fingerprint: DurableExecutionFingerprint;
}>;

export type DurableExecutionEnvelopeDecodeResult =
  | Readonly<{ status: "accepted"; envelope: DurableExecutionEnvelope }>
  | Readonly<{
      status: "rejected";
      code: "invalid_envelope" | "invalid_record" | "fingerprint_mismatch";
      details: readonly string[];
    }>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isFailure(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isNonEmptyString(value.code) &&
      isNonEmptyString(value.message) &&
      Array.isArray(value.details) &&
      value.details.every(isNonEmptyString))
  );
}

function isEvent(value: unknown, index: number): value is DurableExecutionEvent {
  if (!isRecord(value)) return false;
  return (
    value.sequence === index + 1 &&
    isNonEmptyString(value.at) &&
    [
      "lease_acquired",
      "lease_recovered",
      "cancellation_requested",
      "completed",
      "failed",
      "cancelled",
    ].includes(String(value.type)) &&
    isNullableString(value.owner)
  );
}

function isDurableExecutionRecord(value: unknown): value is DurableExecutionRecord {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== DURABLE_EXECUTION_SCHEMA_VERSION ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !isNonEmptyString(value.idempotencyKey) ||
    !isNonEmptyString(value.project) ||
    !DURABLE_EXECUTION_STATUSES.includes(
      value.status as (typeof DURABLE_EXECUTION_STATUSES)[number],
    ) ||
    !Number.isInteger(value.attempt) ||
    Number(value.attempt) < 1 ||
    !isNullableString(value.leaseOwner) ||
    !isNullableString(value.leaseExpiresAt) ||
    typeof value.cancellationRequested !== "boolean" ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt) ||
    !isFailure(value.failure) ||
    !Array.isArray(value.events) ||
    !value.events.every(isEvent)
  ) {
    return false;
  }

  if (value.status === "running") {
    return value.result === null && value.failure === null;
  }
  if (value.status === "completed") {
    return isRecord(value.result) && value.failure === null;
  }
  return value.result === null && isRecord(value.failure);
}

function reject(
  code: Extract<DurableExecutionEnvelopeDecodeResult, { status: "rejected" }>["code"],
  detail: string,
): DurableExecutionEnvelopeDecodeResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    details: Object.freeze([detail]),
  });
}

export function createDurableExecutionEnvelope(
  record: DurableExecutionRecord,
): DurableExecutionEnvelope {
  return Object.freeze({
    schemaVersion: DURABLE_EXECUTION_ENVELOPE_SCHEMA_VERSION,
    record,
    fingerprint: fingerprintDurableExecutionRecord(record),
  });
}

export function decodeDurableExecutionEnvelope(
  value: unknown,
): DurableExecutionEnvelopeDecodeResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DURABLE_EXECUTION_ENVELOPE_SCHEMA_VERSION ||
    !isRecord(value.fingerprint) ||
    value.fingerprint.algorithm !== DURABLE_EXECUTION_FINGERPRINT_ALGORITHM ||
    typeof value.fingerprint.digest !== "string"
  ) {
    return reject("invalid_envelope", "Expected a schemaVersion 1 durable envelope.");
  }
  if (!isDurableExecutionRecord(value.record)) {
    return reject("invalid_record", "Durable execution record structure is invalid.");
  }

  const fingerprint = value.fingerprint as DurableExecutionFingerprint;
  if (!verifyDurableExecutionFingerprint(value.record, fingerprint)) {
    return reject(
      "fingerprint_mismatch",
      "Durable execution record does not match its declared fingerprint.",
    );
  }

  return Object.freeze({
    status: "accepted" as const,
    envelope: Object.freeze({
      schemaVersion: DURABLE_EXECUTION_ENVELOPE_SCHEMA_VERSION,
      record: value.record,
      fingerprint,
    }),
  });
}

export function parseDurableExecutionEnvelope(
  serialized: string,
): DurableExecutionEnvelopeDecodeResult {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    return reject("invalid_envelope", "Expected non-empty durable envelope JSON.");
  }
  try {
    return decodeDurableExecutionEnvelope(JSON.parse(serialized) as unknown);
  } catch {
    return reject("invalid_envelope", "Durable envelope JSON could not be parsed.");
  }
}

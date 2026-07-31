import type {
  DurableExecutionEvent,
  DurableExecutionRecord,
  DurableExecutionStore,
} from "./durable-execution.js";

export type DurableExecutionRecoveryRequest = Readonly<{
  idempotencyKey: string;
  owner: string;
  leaseDurationMs: number;
}>;

export type DurableExecutionRecoveryResult =
  | Readonly<{
      status: "recovered" | "terminal";
      record: DurableExecutionRecord;
    }>
  | Readonly<{
      status: "rejected";
      code:
        | "invalid_request"
        | "not_found"
        | "lease_active"
        | "record_conflict";
      record: DurableExecutionRecord | null;
      details: readonly string[];
    }>;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function reject(
  code: Extract<DurableExecutionRecoveryResult, { status: "rejected" }>["code"],
  record: DurableExecutionRecord | null,
  detail: string,
): DurableExecutionRecoveryResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    record,
    details: Object.freeze([detail]),
  });
}

function recoveryEvent(
  record: DurableExecutionRecord,
  at: string,
  owner: string,
): DurableExecutionEvent {
  return Object.freeze({
    sequence: record.events.length + 1,
    at,
    type: "lease_recovered",
    owner,
  });
}

export function isDurableExecutionLeaseExpired(
  record: DurableExecutionRecord,
  observedAt: string,
): boolean {
  return (
    record.status === "running" &&
    record.leaseExpiresAt !== null &&
    record.leaseExpiresAt <= observedAt
  );
}

export async function recoverDurableExecution(
  store: DurableExecutionStore,
  request: DurableExecutionRecoveryRequest,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionRecoveryResult> {
  if (
    !nonEmpty(request.idempotencyKey) ||
    !nonEmpty(request.owner) ||
    !positiveInteger(request.leaseDurationMs)
  ) {
    return reject(
      "invalid_request",
      null,
      "Expected a non-empty idempotency key, owner and positive lease duration.",
    );
  }

  const key = request.idempotencyKey.trim();
  const owner = request.owner.trim();
  const existing = await store.load(key);
  if (existing === null) {
    return reject("not_found", null, "No durable execution record exists for this key.");
  }
  if (existing.status !== "running") {
    return Object.freeze({ status: "terminal" as const, record: existing });
  }

  const observedAt = now();
  if (!isDurableExecutionLeaseExpired(existing, observedAt)) {
    return reject(
      "lease_active",
      existing,
      "The durable execution lease is still active.",
    );
  }

  const recovered = Object.freeze({
    ...existing,
    revision: existing.revision + 1,
    attempt: existing.attempt + 1,
    leaseOwner: owner,
    leaseExpiresAt: new Date(
      Date.parse(observedAt) + request.leaseDurationMs,
    ).toISOString(),
    updatedAt: observedAt,
    events: Object.freeze([
      ...existing.events,
      recoveryEvent(existing, observedAt, owner),
    ]),
  });

  if (!(await store.save(recovered, existing.revision))) {
    return reject(
      "record_conflict",
      await store.load(key),
      "The durable execution record changed while recovering its lease.",
    );
  }

  return Object.freeze({ status: "recovered" as const, record: recovered });
}

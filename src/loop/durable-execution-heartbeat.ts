import type {
  DurableExecutionEvent,
  DurableExecutionLeaseRenewalResult,
  DurableExecutionRecord,
  DurableExecutionStore,
} from "./durable-execution.js";

export type DurableExecutionHeartbeatRequest = Readonly<{
  idempotencyKey: string;
  owner: string;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
}>;

export type DurableExecutionHeartbeatDependency = Readonly<{
  now(): string;
  sleep(durationMs: number): Promise<void>;
}>;

export type DurableExecutionHeartbeatResult =
  | Readonly<{
      status: "stopped";
      renewals: number;
      record: DurableExecutionRecord | null;
    }>
  | Readonly<{
      status: "lease_lost" | "rejected";
      renewals: number;
      result: DurableExecutionLeaseRenewalResult;
    }>;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDuration(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function reject(
  code: Extract<
    DurableExecutionLeaseRenewalResult,
    { status: "rejected" }
  >["code"],
  record: DurableExecutionRecord | null,
  detail: string,
): DurableExecutionLeaseRenewalResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    record,
    details: Object.freeze([detail]),
  });
}

function renewedEvent(
  record: DurableExecutionRecord,
  at: string,
  owner: string,
): DurableExecutionEvent {
  return Object.freeze({
    sequence: record.events.length + 1,
    at,
    type: "lease_renewed",
    owner,
  });
}

export async function renewDurableExecutionLease(
  store: DurableExecutionStore,
  request: Pick<
    DurableExecutionHeartbeatRequest,
    "idempotencyKey" | "owner" | "leaseDurationMs"
  >,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionLeaseRenewalResult> {
  if (
    !nonEmpty(request.idempotencyKey) ||
    !nonEmpty(request.owner) ||
    !validDuration(request.leaseDurationMs)
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
    return reject(
      "not_running",
      existing,
      "Only a running durable execution lease can be renewed.",
    );
  }
  if (existing.leaseOwner !== owner) {
    return reject(
      "lease_lost",
      existing,
      "The durable execution lease is owned by another worker.",
    );
  }

  const at = now();
  const renewed = Object.freeze({
    ...existing,
    revision: existing.revision + 1,
    leaseExpiresAt: new Date(
      Date.parse(at) + request.leaseDurationMs,
    ).toISOString(),
    updatedAt: at,
    events: Object.freeze([
      ...existing.events,
      renewedEvent(existing, at, owner),
    ]),
  });

  if (!(await store.save(renewed, existing.revision))) {
    return reject(
      "record_conflict",
      await store.load(key),
      "The durable execution record changed while renewing its lease.",
    );
  }

  return Object.freeze({ status: "renewed" as const, record: renewed });
}

export async function runDurableExecutionHeartbeat(
  store: DurableExecutionStore,
  request: DurableExecutionHeartbeatRequest,
  shouldContinue: () => boolean,
  dependency: DurableExecutionHeartbeatDependency = Object.freeze({
    now: () => new Date().toISOString(),
    sleep: (durationMs: number): Promise<void> =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)),
  }),
): Promise<DurableExecutionHeartbeatResult> {
  if (
    !validDuration(request.heartbeatIntervalMs) ||
    request.heartbeatIntervalMs >= request.leaseDurationMs
  ) {
    return Object.freeze({
      status: "rejected" as const,
      renewals: 0,
      result: reject(
        "invalid_request",
        null,
        "Heartbeat interval must be positive and shorter than the lease duration.",
      ),
    });
  }

  let renewals = 0;
  let lastRecord: DurableExecutionRecord | null = null;
  while (shouldContinue()) {
    await dependency.sleep(request.heartbeatIntervalMs);
    if (!shouldContinue()) {
      break;
    }
    const result = await renewDurableExecutionLease(
      store,
      request,
      dependency.now,
    );
    if (result.status === "rejected") {
      return Object.freeze({
        status: result.code === "lease_lost" ? "lease_lost" : "rejected",
        renewals,
        result,
      });
    }
    renewals += 1;
    lastRecord = result.record;
  }

  return Object.freeze({
    status: "stopped" as const,
    renewals,
    record: lastRecord,
  });
}

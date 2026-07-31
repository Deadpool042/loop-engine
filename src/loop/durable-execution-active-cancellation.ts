import type {
  DurableExecutionEvent,
  DurableExecutionRecord,
  DurableExecutionStore,
} from "./durable-execution.js";

export type ActiveExecutionCancellationHandle = Readonly<{
  cancel(): Promise<void>;
  completed: Promise<void>;
}>;

export type ActiveExecutionCancellationRequest = Readonly<{
  idempotencyKey: string;
  owner: string;
  pollIntervalMs: number;
}>;

export type ActiveExecutionCancellationDependency = Readonly<{
  now(): string;
  sleep(durationMs: number): Promise<void>;
}>;

export type ActiveExecutionCancellationResult =
  | Readonly<{
      status: "completed" | "cancelled";
      record: DurableExecutionRecord;
    }>
  | Readonly<{
      status: "rejected";
      code:
        | "invalid_request"
        | "not_found"
        | "not_running"
        | "lease_lost"
        | "record_conflict"
        | "cancellation_failed";
      record: DurableExecutionRecord | null;
      details: readonly string[];
    }>;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function rejected(
  code: Extract<ActiveExecutionCancellationResult, { status: "rejected" }>["code"],
  record: DurableExecutionRecord | null,
  detail: string,
): ActiveExecutionCancellationResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    record,
    details: Object.freeze([detail]),
  });
}

function event(
  record: DurableExecutionRecord,
  at: string,
  type: DurableExecutionEvent["type"],
  owner: string,
): DurableExecutionEvent {
  return Object.freeze({
    sequence: record.events.length + 1,
    at,
    type,
    owner,
  });
}

async function persistCancelled(
  store: DurableExecutionStore,
  record: DurableExecutionRecord,
  owner: string,
  now: string,
): Promise<ActiveExecutionCancellationResult> {
  const cancelled = Object.freeze({
    ...record,
    revision: record.revision + 1,
    status: "cancelled" as const,
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: now,
    events: Object.freeze([
      ...record.events,
      event(record, now, "cancelled", owner),
    ]),
  });

  if (!(await store.save(cancelled, record.revision))) {
    return rejected(
      "record_conflict",
      await store.load(record.idempotencyKey),
      "The durable execution record changed while persisting active cancellation.",
    );
  }

  return Object.freeze({ status: "cancelled" as const, record: cancelled });
}

export async function superviseActiveExecutionCancellation(
  store: DurableExecutionStore,
  request: ActiveExecutionCancellationRequest,
  active: ActiveExecutionCancellationHandle,
  dependency: ActiveExecutionCancellationDependency = Object.freeze({
    now: () => new Date().toISOString(),
    sleep: (durationMs: number): Promise<void> =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)),
  }),
): Promise<ActiveExecutionCancellationResult> {
  if (
    !nonEmpty(request.idempotencyKey) ||
    !nonEmpty(request.owner) ||
    !positiveInteger(request.pollIntervalMs)
  ) {
    return rejected(
      "invalid_request",
      null,
      "Expected a non-empty idempotency key, owner and positive poll interval.",
    );
  }

  const key = request.idempotencyKey.trim();
  const owner = request.owner.trim();

  while (true) {
    const record = await store.load(key);
    if (record === null) {
      return rejected("not_found", null, "No durable execution record exists for this key.");
    }
    if (record.status !== "running") {
      return Object.freeze({ status: "completed" as const, record });
    }
    if (record.leaseOwner !== owner) {
      return rejected(
        "lease_lost",
        record,
        "The active execution lease is no longer owned by this worker.",
      );
    }
    if (record.cancellationRequested) {
      try {
        await active.cancel();
        await active.completed;
      } catch {
        return rejected(
          "cancellation_failed",
          await store.load(key),
          "The active execution could not be terminated safely.",
        );
      }

      const latest = await store.load(key);
      if (latest === null) {
        return rejected("not_found", null, "The durable execution record disappeared during cancellation.");
      }
      if (latest.status !== "running") {
        return Object.freeze({ status: "completed" as const, record: latest });
      }
      if (latest.leaseOwner !== owner) {
        return rejected(
          "lease_lost",
          latest,
          "Lease ownership changed before cancellation could be persisted.",
        );
      }
      return persistCancelled(store, latest, owner, dependency.now());
    }

    const outcome = await Promise.race([
      active.completed.then(() => "completed" as const),
      dependency.sleep(request.pollIntervalMs).then(() => "poll" as const),
    ]);
    if (outcome === "completed") {
      const completed = await store.load(key);
      if (completed === null) {
        return rejected("not_found", null, "The durable execution record disappeared after execution completion.");
      }
      return Object.freeze({ status: "completed" as const, record: completed });
    }
  }
}

import type { LoopRunFailure, LoopRunResult } from "./types.js";
import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  type DurableExecutionCancellationResult,
  type DurableExecutionEvent,
  type DurableExecutionRecord,
  type DurableExecutionRequest,
  type DurableExecutionResult,
  type DurableExecutionStore,
} from "./durable-execution.js";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validRequest(request: DurableExecutionRequest): boolean {
  return (
    nonEmpty(request.idempotencyKey) &&
    nonEmpty(request.project) &&
    nonEmpty(request.owner) &&
    Number.isInteger(request.leaseDurationMs) &&
    request.leaseDurationMs > 0
  );
}

function event(
  record: Pick<DurableExecutionRecord, "events">,
  at: string,
  type: DurableExecutionEvent["type"],
  owner: string | null,
): DurableExecutionEvent {
  return Object.freeze({
    sequence: record.events.length + 1,
    at,
    type,
    owner,
  });
}

function internalFailure(code: string, message: string): LoopRunFailure {
  return Object.freeze({
    code,
    message,
    details: Object.freeze(["Execution diagnostics are redacted."]),
  });
}

function reject(
  code: Extract<DurableExecutionResult, { status: "rejected" }>["code"],
  record: DurableExecutionRecord | null,
  detail: string,
): DurableExecutionResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    record,
    details: Object.freeze([detail]),
  });
}

function leaseExpired(record: DurableExecutionRecord, now: string): boolean {
  return record.leaseExpiresAt !== null && record.leaseExpiresAt <= now;
}

function terminal(record: DurableExecutionRecord): boolean {
  return record.status !== "running";
}

function leaseRecord(
  existing: DurableExecutionRecord | null,
  request: DurableExecutionRequest,
  now: string,
): DurableExecutionRecord {
  const recovered = existing !== null;
  const baseEvents = existing?.events ?? Object.freeze([]);
  const base: DurableExecutionRecord = Object.freeze({
    schemaVersion: DURABLE_EXECUTION_SCHEMA_VERSION,
    revision: (existing?.revision ?? 0) + 1,
    idempotencyKey: request.idempotencyKey.trim(),
    project: request.project.trim(),
    status: "running",
    attempt: (existing?.attempt ?? 0) + 1,
    leaseOwner: request.owner.trim(),
    leaseExpiresAt: new Date(
      Date.parse(now) + request.leaseDurationMs,
    ).toISOString(),
    cancellationRequested: existing?.cancellationRequested ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    result: null,
    failure: null,
    events: baseEvents,
  });
  return Object.freeze({
    ...base,
    events: Object.freeze([
      ...baseEvents,
      event(base, now, recovered ? "lease_recovered" : "lease_acquired", request.owner.trim()),
    ]),
  });
}

function finish(
  leased: DurableExecutionRecord,
  now: string,
  status: "completed" | "failed" | "cancelled",
  result: LoopRunResult | null,
  failure: LoopRunFailure | null,
): DurableExecutionRecord {
  const type = status;
  return Object.freeze({
    ...leased,
    revision: leased.revision + 1,
    status,
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: now,
    result,
    failure,
    events: Object.freeze([
      ...leased.events,
      event(leased, now, type, leased.leaseOwner),
    ]),
  });
}

export async function runDurableLoopExecution(
  store: DurableExecutionStore,
  request: DurableExecutionRequest,
  execute: () => Promise<LoopRunResult>,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionResult> {
  if (!validRequest(request)) {
    return reject("invalid_request", null, "Expected a valid idempotency key, project, owner and positive lease duration.");
  }

  const observedAt = now();
  const existing = await store.load(request.idempotencyKey.trim());
  if (existing !== null && existing.project !== request.project.trim()) {
    return reject("project_mismatch", existing, "The idempotency key is already bound to another project.");
  }
  if (existing !== null && terminal(existing)) {
    return Object.freeze({ status: "replayed" as const, record: existing });
  }
  if (
    existing !== null &&
    !leaseExpired(existing, observedAt) &&
    existing.leaseOwner !== request.owner.trim()
  ) {
    return reject("execution_in_progress", existing, "Another owner holds the active execution lease.");
  }

  const leased = leaseRecord(existing, request, observedAt);
  const acquired = await store.save(leased, existing?.revision ?? null);
  if (!acquired) {
    return reject("record_conflict", await store.load(request.idempotencyKey.trim()), "The durable execution record changed while acquiring its lease.");
  }

  if (leased.cancellationRequested) {
    const cancelled = finish(leased, now(), "cancelled", null, internalFailure("execution_cancelled", "Execution was cancelled before provider invocation."));
    if (!(await store.save(cancelled, leased.revision))) {
      return reject("record_conflict", await store.load(request.idempotencyKey.trim()), "The durable execution record changed while finalizing cancellation.");
    }
    return Object.freeze({ status: "executed" as const, record: cancelled });
  }

  let result: LoopRunResult;
  try {
    result = await execute();
  } catch {
    const failed = finish(leased, now(), "failed", null, internalFailure("durable_execution_failed", "The durable execution callback failed."));
    if (!(await store.save(failed, leased.revision))) {
      return reject("record_conflict", await store.load(request.idempotencyKey.trim()), "The durable execution record changed while persisting failure.");
    }
    return Object.freeze({ status: "executed" as const, record: failed });
  }

  const latest = await store.load(request.idempotencyKey.trim());
  const cancelledAfterRun = latest?.cancellationRequested === true;
  const completed = finish(
    leased,
    now(),
    cancelledAfterRun ? "cancelled" : result.status === "completed" ? "completed" : "failed",
    cancelledAfterRun ? null : result,
    cancelledAfterRun
      ? internalFailure("execution_cancelled", "Cancellation was observed before terminal persistence.")
      : result.failure,
  );
  const expectedRevision = latest?.revision ?? leased.revision;
  if (!(await store.save(completed, expectedRevision))) {
    return reject("record_conflict", await store.load(request.idempotencyKey.trim()), "The durable execution record changed while persisting its terminal result.");
  }
  return Object.freeze({ status: "executed" as const, record: completed });
}

export async function requestDurableExecutionCancellation(
  store: DurableExecutionStore,
  idempotencyKey: string,
  requestedBy: string,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionCancellationResult> {
  if (!nonEmpty(idempotencyKey) || !nonEmpty(requestedBy)) {
    return Object.freeze({ status: "rejected" as const, code: "invalid_request" as const, details: Object.freeze(["Expected a non-empty idempotency key and requester."]) });
  }
  const existing = await store.load(idempotencyKey.trim());
  if (existing === null) {
    return Object.freeze({ status: "rejected" as const, code: "not_found" as const, details: Object.freeze(["No durable execution record exists for this key."]) });
  }
  if (terminal(existing)) {
    return Object.freeze({ status: "already_terminal" as const, record: existing });
  }
  const at = now();
  const updated = Object.freeze({
    ...existing,
    revision: existing.revision + 1,
    cancellationRequested: true,
    updatedAt: at,
    events: Object.freeze([
      ...existing.events,
      event(existing, at, "cancellation_requested", requestedBy.trim()),
    ]),
  });
  if (!(await store.save(updated, existing.revision))) {
    return Object.freeze({ status: "rejected" as const, code: "record_conflict" as const, details: Object.freeze(["The durable execution record changed while requesting cancellation."]) });
  }
  return Object.freeze({ status: "requested" as const, record: updated });
}

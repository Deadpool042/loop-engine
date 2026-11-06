import { isCanonicalInput, isCanonicalProject } from "../core/canonical-input.js";
import {
  abortWithReason,
  type LoopCancellationReason,
} from "./cancellation.js";
import type { LoopRunFailure, LoopRunResult } from "./types.js";
import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  type DurableExecutionCancellationResult,
  type DurableExecutionEvent,
  type DurableExecutionProgress,
  type DurableExecutionProgressedEvent,
  type DurableExecutionProgressedSink,
  type DurableExecutionRecord,
  type DurableExecutionRequest,
  type DurableExecutionResult,
  type DurableExecutionStore,
} from "./durable-execution.js";

const MAX_PROGRESS_EVENTS = 32;

/**
 * Handed to the execute callback. `signal` aborts when the controller observes
 * that the lease was lost or that a cancellation was requested; `requestAbort`
 * is the hook a future lease-renewal supervisor calls on `lease_lost`.
 *
 * Detection today happens only when a progress event is persisted, i.e. at run
 * transitions, not during a long executor call: without a renewal heartbeat an
 * executor can keep acting after its lease expired until its next transition.
 * Aborting the signal is a request, not proof that the executor stopped.
 */
export type DurableExecutionRunContext = Readonly<{
  signal: AbortSignal;
  requestAbort(reason: LoopCancellationReason): void;
}>;

function progressedEvent(
  record: DurableExecutionRecord,
): DurableExecutionProgressedEvent {
  const latest = record.progress;
  return Object.freeze({
    schemaVersion: 1 as const,
    type: "execution.progressed" as const,
    project: record.project,
    idempotencyKey: record.idempotencyKey,
    runId: latest?.runId ?? record.result?.runId ?? null,
    revision: record.revision,
    status: record.status,
    step:
      record.status === "running"
        ? (latest?.step ?? "starting")
        : (record.result?.steps.at(-1)?.name ?? latest?.step ?? record.status),
    updatedAt: record.updatedAt,
    terminal: record.status !== "running",
  });
}

function emitProgressed(
  sink: DurableExecutionProgressedSink | undefined,
  record: DurableExecutionRecord,
): void {
  if (!sink) return;
  try {
    void Promise.resolve(sink(progressedEvent(record))).catch(() => {
      // Event transport is auxiliary. Durable execution remains authoritative.
    });
  } catch {
    // Event transport is auxiliary. Durable execution remains authoritative.
  }
}

// Inputs are refused, never normalized (L7.1 E5): the string that is validated
// is the string that is stored, looked up and compared.
function validRequest(request: DurableExecutionRequest): boolean {
  return (
    isCanonicalInput(request.idempotencyKey) &&
    isCanonicalProject(request.project) &&
    isCanonicalInput(request.owner) &&
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
    idempotencyKey: request.idempotencyKey,
    project: request.project,
    status: "running",
    attempt: (existing?.attempt ?? 0) + 1,
    leaseOwner: request.owner,
    leaseExpiresAt: new Date(
      Date.parse(now) + request.leaseDurationMs,
    ).toISOString(),
    cancellationRequested: existing?.cancellationRequested ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    progress: null,
    progressEvents: Object.freeze([]),
    result: null,
    failure: null,
    events: baseEvents,
  });
  return Object.freeze({
    ...base,
    events: Object.freeze([
      ...baseEvents,
      event(base, now, recovered ? "lease_recovered" : "lease_acquired", request.owner),
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
  execute: (
    onProgress: (progress: DurableExecutionProgress) => void,
    context: DurableExecutionRunContext,
  ) => Promise<LoopRunResult>,
  now: () => string = () => new Date().toISOString(),
  onProgressed?: DurableExecutionProgressedSink,
): Promise<DurableExecutionResult> {
  if (!validRequest(request)) {
    return reject("invalid_request", null, "Expected a canonical idempotency key, project and owner and a positive lease duration.");
  }

  const observedAt = now();
  const existing = await store.load(request.idempotencyKey);
  if (existing !== null && existing.project !== request.project) {
    return reject("project_mismatch", existing, "The idempotency key is already bound to another project.");
  }
  if (
    existing !== null &&
    terminal(existing) &&
    (existing.status === "completed" || request.retryTerminal !== true)
  ) {
    return Object.freeze({ status: "replayed" as const, record: existing });
  }
  // An active lease excludes every requester, including one presenting the same
  // owner string: two live processes may share a label, so the label alone is
  // not an identity. Only expiry (or termination) releases the lease.
  if (
    existing !== null &&
    existing.status === "running" &&
    !leaseExpired(existing, observedAt)
  ) {
    return reject("execution_in_progress", existing, "An active execution lease is held.");
  }

  const leased = leaseRecord(existing, request, observedAt);
  const acquired = await store.save(leased, existing?.revision ?? null);
  if (!acquired) {
    return reject("record_conflict", await store.load(request.idempotencyKey), "The durable execution record changed while acquiring its lease.");
  }
  emitProgressed(onProgressed, leased);

  if (leased.cancellationRequested) {
    const cancelled = finish(leased, now(), "cancelled", null, internalFailure("execution_cancelled", "Execution was cancelled before provider invocation."));
    if (!(await store.save(cancelled, leased.revision))) {
      return reject("record_conflict", await store.load(request.idempotencyKey), "The durable execution record changed while finalizing cancellation.");
    }
    emitProgressed(onProgressed, cancelled);
    return Object.freeze({ status: "executed" as const, record: cancelled });
  }

  const key = request.idempotencyKey;
  const owner = request.owner;
  // Holder identity is (owner, attempt): the attempt counter is incremented by
  // every acquisition, so a former holder that shares an owner label with its
  // successor still cannot act on the successor's lease.
  const attempt = leased.attempt;
  const isHolder = (record: DurableExecutionRecord | null): record is DurableExecutionRecord =>
    record !== null &&
    record.status === "running" &&
    record.leaseOwner === owner &&
    record.attempt === attempt;
  let progressWrites: Promise<void> = Promise.resolve();
  const abortController = new AbortController();
  const runContext: DurableExecutionRunContext = Object.freeze({
    signal: abortController.signal,
    requestAbort(reason: LoopCancellationReason): void {
      abortWithReason(abortController, reason);
    },
  });

  const observeProgress = (progress: DurableExecutionProgress): void => {
    progressWrites = progressWrites
      .then(async () => {
        const current = await store.load(key);
        if (!isHolder(current)) {
          // Another worker holds the lease (or the record is gone): the
          // executor must stop acting under a lease it no longer owns.
          runContext.requestAbort("lease_lost");
          return;
        }
        if (current.cancellationRequested) {
          runContext.requestAbort("cancellation_requested");
        }
        const progressEvents = Object.freeze([
          ...(current.progressEvents ?? []),
          progress,
        ].slice(-MAX_PROGRESS_EVENTS));
        const updated = Object.freeze({
          ...current,
          revision: current.revision + 1,
          updatedAt: progress.at,
          progress,
          progressEvents,
        });
        if (await store.save(updated, current.revision)) {
          emitProgressed(onProgressed, updated);
        }
      })
      .catch(() => {
        // Progress is auxiliary. A telemetry write must never fail the run.
      });
  };

  let result: LoopRunResult;
  try {
    result = await execute(observeProgress, runContext);
    await progressWrites;
  } catch {
    await progressWrites;
    const latest = await store.load(key);
    const base = isHolder(latest) ? latest : leased;
    const failed = finish(
      base,
      now(),
      "failed",
      null,
      internalFailure(
        "durable_execution_failed",
        "The durable execution callback failed.",
      ),
    );
    if (!(await store.save(failed, base.revision))) {
      return reject(
        "record_conflict",
        await store.load(key),
        "The durable execution record changed while persisting failure.",
      );
    }
    emitProgressed(onProgressed, failed);
    return Object.freeze({ status: "executed" as const, record: failed });
  }

  const latest = await store.load(key);
  const base = isHolder(latest) ? latest : leased;
  const cancelledAfterRun = base.cancellationRequested === true;
  // A run that observed a cancellation is persisted as cancelled, with its
  // redacted cause and any cleanup failure, and is never recorded as completed.
  const runCancelled = result.status === "cancelled";
  const completed = finish(
    base,
    now(),
    cancelledAfterRun || runCancelled
      ? "cancelled"
      : result.status === "completed"
        ? "completed"
        : "failed",
    runCancelled || !cancelledAfterRun ? result : null,
    runCancelled
      ? (result.failure ??
        internalFailure(
          "execution_cancelled",
          "Execution was cancelled before completion.",
        ))
      : cancelledAfterRun
        ? internalFailure(
            "execution_cancelled",
            "Cancellation was observed before terminal persistence.",
          )
        : result.failure,
  );
  if (!(await store.save(completed, base.revision))) {
    return reject(
      "record_conflict",
      await store.load(key),
      "The durable execution record changed while persisting its terminal result.",
    );
  }
  emitProgressed(onProgressed, completed);
  return Object.freeze({ status: "executed" as const, record: completed });
}

export async function requestDurableExecutionCancellation(
  store: DurableExecutionStore,
  idempotencyKey: string,
  requestedBy: string,
  now: () => string = () => new Date().toISOString(),
  onProgressed?: DurableExecutionProgressedSink,
): Promise<DurableExecutionCancellationResult> {
  if (!isCanonicalInput(idempotencyKey) || !isCanonicalInput(requestedBy)) {
    return Object.freeze({ status: "rejected" as const, code: "invalid_request" as const, details: Object.freeze(["Expected a canonical idempotency key and requester."]) });
  }
  const existing = await store.load(idempotencyKey);
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
      event(existing, at, "cancellation_requested", requestedBy),
    ]),
  });
  if (!(await store.save(updated, existing.revision))) {
    return Object.freeze({ status: "rejected" as const, code: "record_conflict" as const, details: Object.freeze(["The durable execution record changed while requesting cancellation."]) });
  }
  emitProgressed(onProgressed, updated);
  return Object.freeze({ status: "requested" as const, record: updated });
}

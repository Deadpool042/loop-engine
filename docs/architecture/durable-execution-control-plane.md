# Durable execution control plane

## Purpose

V15.0 makes Loop Engine safe to trigger from n8n, cron, queues and other at-least-once supervisors. A supervisor can retry the same request without creating a second AI execution, detect an active owner, recover an expired worker, request cancellation and replay the immutable terminal result.

This is an orchestration boundary around the existing runner. It does not duplicate planning, policy selection, provider failover, validation, repair, reporting or publication logic.

## Lifecycle

```text
external trigger
  -> idempotency key validation
  -> durable record lookup
  -> terminal replay OR lease acquisition
  -> existing Loop execute runner
  -> terminal result persistence
  -> integrity fingerprint
```

A record contains:

- one idempotency key permanently bound to one project;
- monotonic revision and attempt counters;
- current lease owner and expiry;
- cancellation intent;
- terminal `LoopRunResult` or redacted failure;
- an ordered immutable event journal.

## Idempotency

A terminal record is replayed without invoking the runner or a provider. The same key cannot be reused for another project. This lets n8n retry delivery after timeouts or network failures without spending more tokens or repeating worktree mutations.

## Concurrency and recovery

Only one owner may hold a non-expired lease. Another owner receives `execution_in_progress` and must not invoke an AI worker.

After lease expiry, a new owner may recover the record. Recovery increments the attempt counter and appends `lease_recovered`. Recovery never hides the previous attempt history.

The store uses compare-and-swap revisions. Concurrent updates fail closed as `record_conflict` rather than silently overwriting another supervisor decision.

## Cancellation

Cancellation is cooperative and durable. A supervisor records `cancellation_requested`; the control plane checks it before provider invocation and again before terminal persistence. The final public failure is stable and redacted.

Provider adapters still own their configured process timeout. V15.0 does not introduce unsafe process signalling across machines.

## Integrity

`canonicalizeDurableExecutionRecord(...)` serializes the complete bounded record in fixed field order. `fingerprintDurableExecutionRecord(...)` creates a SHA-256 digest and `verifyDurableExecutionFingerprint(...)` uses timing-safe comparison.

The fingerprint detects journal, lease, result, attempt and cancellation drift. It is an integrity identifier, not an authenticity signature.

## Storage port

`DurableExecutionStore` exposes only:

```ts
load(idempotencyKey)
save(record, expectedRevision)
```

This small compare-and-swap port supports database, object storage, queue-backed and transactional adapters without coupling Core to a vendor. The included in-memory adapter is deterministic and intended for embedded use and tests.

## n8n responsibility

n8n:

- creates a stable idempotency key for one reviewed cycle;
- supplies a unique worker owner id;
- retries rejected transport delivery with the same key;
- waits or reschedules on `execution_in_progress`;
- requests cancellation when an operator stops a run;
- stores the returned fingerprint with the record/report.

Loop Engine:

- owns lease and replay semantics;
- invokes the runner at most once per successful terminal record;
- persists stable redacted outcomes;
- preserves provider failover evidence inside the stored `LoopRunResult`;
- prevents project/key aliasing and concurrent execution.

## Security invariants

- no provider output, stderr, stack trace, credential or environment value enters the control record;
- duplicate triggers do not increase token, cost or call budgets;
- active leases block concurrent providers;
- stale leases are recoverable but never silently replaced;
- cancellation is persisted before it is acted upon;
- terminal results are immutable and replayable;
- storage conflicts fail closed;
- the controller cannot commit or publish by itself.

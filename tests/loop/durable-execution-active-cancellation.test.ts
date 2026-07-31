import assert from "node:assert/strict";
import test from "node:test";

import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  createInMemoryDurableExecutionStore,
  superviseActiveExecutionCancellation,
  type DurableExecutionRecord,
} from "../../src/core/index.js";

function record(overrides: Partial<DurableExecutionRecord> = {}): DurableExecutionRecord {
  return Object.freeze({
    schemaVersion: DURABLE_EXECUTION_SCHEMA_VERSION,
    revision: 1,
    idempotencyKey: "job-1",
    project: "project-a",
    status: "running",
    attempt: 1,
    leaseOwner: "worker-a",
    leaseExpiresAt: "2026-07-31T09:00:00.000Z",
    cancellationRequested: true,
    createdAt: "2026-07-31T08:00:00.000Z",
    updatedAt: "2026-07-31T08:00:00.000Z",
    result: null,
    failure: null,
    events: Object.freeze([]),
    ...overrides,
  });
}

test("cancels active work and persists cancelled state", async () => {
  const store = createInMemoryDurableExecutionStore([record()]);
  let cancelCalls = 0;
  const result = await superviseActiveExecutionCancellation(
    store,
    { idempotencyKey: "job-1", owner: "worker-a", pollIntervalMs: 10 },
    {
      async cancel() { cancelCalls += 1; },
      completed: Promise.resolve(),
    },
    { now: () => "2026-07-31T08:01:00.000Z", sleep: async () => {} },
  );
  assert.equal(result.status, "cancelled");
  assert.equal(cancelCalls, 1);
  assert.equal(result.record.status, "cancelled");
  assert.equal(result.record.leaseOwner, null);
  assert.equal(result.record.events.at(-1)?.type, "cancelled");
});

test("rejects cancellation after lease ownership changes", async () => {
  const store = createInMemoryDurableExecutionStore([record({ leaseOwner: "worker-b" })]);
  let cancelCalls = 0;
  const result = await superviseActiveExecutionCancellation(
    store,
    { idempotencyKey: "job-1", owner: "worker-a", pollIntervalMs: 10 },
    { async cancel() { cancelCalls += 1; }, completed: Promise.resolve() },
    { now: () => "2026-07-31T08:01:00.000Z", sleep: async () => {} },
  );
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.code, "lease_lost");
  assert.equal(cancelCalls, 0);
});

test("does not cancel terminal work", async () => {
  const store = createInMemoryDurableExecutionStore([
    record({ status: "completed", leaseOwner: null, leaseExpiresAt: null }),
  ]);
  let cancelCalls = 0;
  const result = await superviseActiveExecutionCancellation(
    store,
    { idempotencyKey: "job-1", owner: "worker-a", pollIntervalMs: 10 },
    { async cancel() { cancelCalls += 1; }, completed: Promise.resolve() },
    { now: () => "2026-07-31T08:01:00.000Z", sleep: async () => {} },
  );
  assert.equal(result.status, "completed");
  assert.equal(cancelCalls, 0);
});

test("keeps running state when active cancellation fails", async () => {
  const store = createInMemoryDurableExecutionStore([record()]);
  const result = await superviseActiveExecutionCancellation(
    store,
    { idempotencyKey: "job-1", owner: "worker-a", pollIntervalMs: 10 },
    { async cancel() { throw new Error("failed"); }, completed: Promise.resolve() },
    { now: () => "2026-07-31T08:01:00.000Z", sleep: async () => {} },
  );
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "cancellation_failed");
    assert.equal(result.record?.status, "running");
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  createInMemoryDurableExecutionStore,
  recoverDurableExecution,
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
    leaseExpiresAt: "2026-07-31T08:00:00.000Z",
    cancellationRequested: false,
    createdAt: "2026-07-31T07:00:00.000Z",
    updatedAt: "2026-07-31T07:00:00.000Z",
    result: null,
    failure: null,
    events: Object.freeze([]),
    ...overrides,
  });
}

test("recovers an expired running execution with a new owner", async () => {
  const store = createInMemoryDurableExecutionStore([record()]);
  const result = await recoverDurableExecution(store, {
    idempotencyKey: "job-1",
    owner: "worker-b",
    leaseDurationMs: 60_000,
  }, () => "2026-07-31T08:01:00.000Z");
  assert.equal(result.status, "recovered");
  if (result.status === "recovered") {
    assert.equal(result.record.attempt, 2);
    assert.equal(result.record.revision, 2);
    assert.equal(result.record.leaseOwner, "worker-b");
    assert.equal(result.record.events.at(-1)?.type, "lease_recovered");
  }
});

test("rejects recovery while the previous lease remains active", async () => {
  const store = createInMemoryDurableExecutionStore([record({ leaseExpiresAt: "2026-07-31T08:02:00.000Z" })]);
  const result = await recoverDurableExecution(store, {
    idempotencyKey: "job-1",
    owner: "worker-b",
    leaseDurationMs: 60_000,
  }, () => "2026-07-31T08:01:00.000Z");
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.code, "lease_active");
});

test("returns terminal records without creating another attempt", async () => {
  const store = createInMemoryDurableExecutionStore([record({ status: "completed", leaseOwner: null, leaseExpiresAt: null })]);
  const result = await recoverDurableExecution(store, {
    idempotencyKey: "job-1",
    owner: "worker-b",
    leaseDurationMs: 60_000,
  }, () => "2026-07-31T08:01:00.000Z");
  assert.equal(result.status, "terminal");
  if (result.status === "terminal") assert.equal(result.record.attempt, 1);
});

test("allows only one concurrent recovery", async () => {
  const store = createInMemoryDurableExecutionStore([record()]);
  const now = () => "2026-07-31T08:01:00.000Z";
  const [left, right] = await Promise.all([
    recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-b", leaseDurationMs: 60_000 }, now),
    recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-c", leaseDurationMs: 60_000 }, now),
  ]);
  assert.deepEqual([left.status, right.status].sort(), ["recovered", "rejected"]);
  assert.equal((await store.load("job-1"))?.attempt, 2);
});

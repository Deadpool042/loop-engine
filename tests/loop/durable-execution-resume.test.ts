import assert from "node:assert/strict";
import test from "node:test";
import { DURABLE_EXECUTION_SCHEMA_VERSION, type DurableExecutionRecord } from "../../src/loop/durable-execution.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import { recoverDurableExecution } from "../../src/loop/durable-execution-recovery.js";

const base = (overrides: Partial<DurableExecutionRecord> = {}): DurableExecutionRecord => Object.freeze({
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

test("claims an expired execution exactly once", async () => {
  const store = createInMemoryDurableExecutionStore([base()]);
  const now = () => "2026-07-31T08:01:00.000Z";
  const [a, b] = await Promise.all([
    recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-b", leaseDurationMs: 60_000 }, now),
    recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-c", leaseDurationMs: 60_000 }, now),
  ]);
  assert.deepEqual([a.status, b.status].sort(), ["recovered", "rejected"]);
  const saved = await store.load("job-1");
  assert.equal(saved?.attempt, 2);
  assert.equal(saved?.events.at(-1)?.type, "lease_recovered");
});

test("does not claim an active lease", async () => {
  const store = createInMemoryDurableExecutionStore([base({ leaseExpiresAt: "2026-07-31T08:02:00.000Z" })]);
  const result = await recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-b", leaseDurationMs: 60_000 }, () => "2026-07-31T08:01:00.000Z");
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.code, "lease_active");
});

test("replays terminal state without another attempt", async () => {
  const store = createInMemoryDurableExecutionStore([base({ status: "completed", leaseOwner: null, leaseExpiresAt: null })]);
  const result = await recoverDurableExecution(store, { idempotencyKey: "job-1", owner: "worker-b", leaseDurationMs: 60_000 }, () => "2026-07-31T08:01:00.000Z");
  assert.equal(result.status, "terminal");
  if (result.status === "terminal") assert.equal(result.record.attempt, 1);
});

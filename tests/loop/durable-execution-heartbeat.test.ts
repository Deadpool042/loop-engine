import assert from "node:assert/strict";
import test from "node:test";
import {
  renewDurableExecutionLease,
  runDurableExecutionHeartbeat,
} from "../../src/loop/durable-execution-heartbeat.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type { DurableExecutionRecord } from "../../src/loop/durable-execution.js";

function runningRecord(
  overrides: Partial<DurableExecutionRecord> = {},
): DurableExecutionRecord {
  return Object.freeze({
    schemaVersion: 1,
    revision: 1,
    idempotencyKey: "job-1",
    project: "alpha",
    status: "running",
    attempt: 1,
    leaseOwner: "worker-a",
    leaseExpiresAt: "2026-07-31T10:00:10.000Z",
    cancellationRequested: false,
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
    result: null,
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-07-31T10:00:00.000Z",
        type: "lease_acquired" as const,
        owner: "worker-a",
      }),
    ]),
    ...overrides,
  });
}

test("renews the active owner's lease with compare-and-swap semantics", async () => {
  const store = createInMemoryDurableExecutionStore([runningRecord()]);
  const result = await renewDurableExecutionLease(
    store,
    {
      idempotencyKey: "job-1",
      owner: "worker-a",
      leaseDurationMs: 30_000,
    },
    () => "2026-07-31T10:00:05.000Z",
  );

  assert.equal(result.status, "renewed");
  if (result.status !== "renewed") return;
  assert.equal(result.record.revision, 2);
  assert.equal(result.record.leaseExpiresAt, "2026-07-31T10:00:35.000Z");
  assert.equal(result.record.events.at(-1)?.type, "lease_renewed");
  assert.equal(result.record.events.at(-1)?.owner, "worker-a");
});

test("fails closed when another worker owns the lease", async () => {
  const store = createInMemoryDurableExecutionStore([runningRecord()]);
  const result = await renewDurableExecutionLease(store, {
    idempotencyKey: "job-1",
    owner: "worker-b",
    leaseDurationMs: 30_000,
  });

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") return;
  assert.equal(result.code, "lease_lost");
  assert.equal(store.records()[0]?.revision, 1);
});

test("does not renew a terminal execution", async () => {
  const store = createInMemoryDurableExecutionStore([
    runningRecord({ status: "completed", leaseOwner: null, leaseExpiresAt: null }),
  ]);
  const result = await renewDurableExecutionLease(store, {
    idempotencyKey: "job-1",
    owner: "worker-a",
    leaseDurationMs: 30_000,
  });

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") return;
  assert.equal(result.code, "not_running");
});

test("runs deterministic renewals until supervision stops", async () => {
  const store = createInMemoryDurableExecutionStore([runningRecord()]);
  let sleeps = 0;
  let running = true;
  const times = [
    "2026-07-31T10:00:03.000Z",
    "2026-07-31T10:00:06.000Z",
  ];

  const result = await runDurableExecutionHeartbeat(
    store,
    {
      idempotencyKey: "job-1",
      owner: "worker-a",
      leaseDurationMs: 10_000,
      heartbeatIntervalMs: 3_000,
    },
    () => running,
    {
      now: () => times.shift() ?? "2026-07-31T10:00:06.000Z",
      async sleep() {
        sleeps += 1;
        if (sleeps === 3) running = false;
      },
    },
  );

  assert.equal(result.status, "stopped");
  assert.equal(result.renewals, 2);
  assert.equal(store.records()[0]?.revision, 3);
  assert.equal(
    store.records()[0]?.events.filter((event) => event.type === "lease_renewed").length,
    2,
  );
});

test("heartbeat stops immediately after ownership is lost", async () => {
  const initial = runningRecord();
  let current = initial;
  let saves = 0;
  const store = {
    async load() {
      return current;
    },
    async save(record: DurableExecutionRecord, expectedRevision: number | null) {
      saves += 1;
      if (saves === 1) {
        current = Object.freeze({
          ...record,
          revision: record.revision + 1,
          leaseOwner: "worker-b",
        });
        return false;
      }
      if (current.revision !== expectedRevision) return false;
      current = record;
      return true;
    },
  };

  const result = await runDurableExecutionHeartbeat(
    store,
    {
      idempotencyKey: "job-1",
      owner: "worker-a",
      leaseDurationMs: 10_000,
      heartbeatIntervalMs: 3_000,
    },
    () => true,
    {
      now: () => "2026-07-31T10:00:03.000Z",
      async sleep() {},
    },
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.renewals, 0);
  if (result.status === "stopped") return;
  assert.equal(result.result.status, "rejected");
  if (result.result.status === "rejected") {
    assert.equal(result.result.code, "record_conflict");
  }
});

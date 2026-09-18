import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runDurableLoopExecution } from "../../src/loop/durable-execution-controller.js";
import { buildExecutionStatusReport } from "../../src/composition/execution-status.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type {
  DurableExecutionProgressedEvent,
  DurableExecutionProgress,
} from "../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function completedResult(project: string): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-v56",
    project,
    mode: "execute",
    status: "completed",
    startedAt: "2026-09-18T05:30:00.000Z",
    completedAt: "2026-09-18T05:30:03.000Z",
    candidate: null,
    steps: Object.freeze([
      Object.freeze({
        name: "validation",
        status: "completed",
        startedAt: "2026-09-18T05:30:02.000Z",
        completedAt: "2026-09-18T05:30:03.000Z",
        details: Object.freeze([]),
      }),
    ]),
    validation: null,
    modifiedFiles: Object.freeze(["src/example.ts"]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  });
}

function executingProgress(): DurableExecutionProgress {
  return Object.freeze({
    status: "executing",
    at: "2026-09-18T05:30:01.000Z",
    runId: "run-v56",
    step: "provider",
    details: Object.freeze(["Provider invocation started."]),
    executor: Object.freeze({
      profileId: "configured.openclaw.economy",
      provider: "openai",
      runtime: "openclaw",
      model: "gpt-5.6-luna",
      effort: "low",
      fundingMode: "included_subscription",
      attempt: 1,
      maxAttempts: 1,
    }),
  });
}

test("V56 emits monotonic execution.progressed events after durable revisions", async () => {
  const store = createInMemoryDurableExecutionStore();
  const events: DurableExecutionProgressedEvent[] = [];
  const times = [
    "2026-09-18T05:30:00.000Z",
    "2026-09-18T05:30:03.000Z",
  ];

  const result = await runDurableLoopExecution(
    store,
    {
      idempotencyKey: "auto-subscription:creatyss:VNEXT4-S6A:1234567890123456789012345678901234567890",
      project: "creatyss",
      owner: "worker-v56",
      leaseDurationMs: 60_000,
    },
    async (onProgress) => {
      onProgress(executingProgress());
      return completedResult("creatyss");
    },
    () => times.shift() ?? "2026-09-18T05:30:04.000Z",
    (event) => {
      events.push(event);
    },
  );

  assert.equal(result.status, "executed");
  assert.deepEqual(
    events.map((event) => event.type),
    ["execution.progressed", "execution.progressed", "execution.progressed"],
  );
  assert.deepEqual(
    events.map((event) => event.revision),
    [1, 2, 3],
  );
  assert.deepEqual(
    events.map((event) => event.step),
    ["starting", "provider", "validation"],
  );
  assert.deepEqual(
    events.map((event) => event.terminal),
    [false, false, true],
  );
  assert.equal(events[1]?.runId, "run-v56");
  assert.equal(events[2]?.status, "completed");

  const persisted = await store.load(
    "auto-subscription:creatyss:VNEXT4-S6A:1234567890123456789012345678901234567890",
  );
  assert.equal(persisted?.revision, 3);
  assert.equal(events.at(-1)?.revision, persisted?.revision);
});

test("V56 event sink failure never fails or rewrites the durable execution", async () => {
  const store = createInMemoryDurableExecutionStore();
  let sinkCalls = 0;

  const result = await runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:v56:sink-failure",
      project: "loop-engine",
      owner: "worker-v56",
      leaseDurationMs: 60_000,
    },
    async (onProgress) => {
      onProgress(executingProgress());
      return completedResult("loop-engine");
    },
    () => "2026-09-18T05:31:00.000Z",
    () => {
      sinkCalls += 1;
      throw new Error("transport unavailable");
    },
  );

  assert.equal(result.status, "executed");
  assert.equal(result.record.status, "completed");
  assert.ok(sinkCalls >= 2);
  const persisted = await store.load("cycle:v56:sink-failure");
  assert.equal(persisted?.status, "completed");
  assert.equal(persisted?.result?.runId, "run-v56");
});


test("V56 recovery emits the recovered durable revision before terminal state", async () => {
  const store = createInMemoryDurableExecutionStore();
  const stale = Object.freeze({
    schemaVersion: 1 as const,
    revision: 1,
    idempotencyKey: "cycle:v56:recovery",
    project: "loop-engine",
    status: "running" as const,
    attempt: 1,
    leaseOwner: "stale-worker",
    leaseExpiresAt: "2026-09-18T05:39:00.000Z",
    cancellationRequested: false,
    createdAt: "2026-09-18T05:38:00.000Z",
    updatedAt: "2026-09-18T05:38:00.000Z",
    progress: null,
    progressEvents: Object.freeze([]),
    result: null,
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-09-18T05:38:00.000Z",
        type: "lease_acquired" as const,
        owner: "stale-worker",
      }),
    ]),
  });
  assert.equal(await store.save(stale, null), true);

  const events: DurableExecutionProgressedEvent[] = [];
  const result = await runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:v56:recovery",
      project: "loop-engine",
      owner: "recovery-worker",
      leaseDurationMs: 60_000,
    },
    async () => completedResult("loop-engine"),
    () => "2026-09-18T05:40:00.000Z",
    (event) => {
      events.push(event);
    },
  );

  assert.equal(result.status, "executed");
  assert.deepEqual(events.map((event) => event.revision), [2, 3]);
  assert.equal(events[0]?.terminal, false);
  assert.equal(events[1]?.terminal, true);
  assert.equal(result.record.attempt, 2);
});

test("V56 cancellation request emits the persisted revision", async () => {
  const { requestDurableExecutionCancellation } = await import(
    "../../src/loop/durable-execution-controller.js"
  );
  const store = createInMemoryDurableExecutionStore();
  const active = Object.freeze({
    schemaVersion: 1 as const,
    revision: 1,
    idempotencyKey: "cycle:v56:cancel",
    project: "loop-engine",
    status: "running" as const,
    attempt: 1,
    leaseOwner: "worker-v56",
    leaseExpiresAt: "2026-09-18T06:00:00.000Z",
    cancellationRequested: false,
    createdAt: "2026-09-18T05:45:00.000Z",
    updatedAt: "2026-09-18T05:45:00.000Z",
    progress: null,
    progressEvents: Object.freeze([]),
    result: null,
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-09-18T05:45:00.000Z",
        type: "lease_acquired" as const,
        owner: "worker-v56",
      }),
    ]),
  });
  assert.equal(await store.save(active, null), true);

  const events: DurableExecutionProgressedEvent[] = [];
  const result = await requestDurableExecutionCancellation(
    store,
    "cycle:v56:cancel",
    "operator",
    () => "2026-09-18T05:46:00.000Z",
    (event) => {
      events.push(event);
    },
  );

  assert.equal(result.status, "requested");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.revision, 2);
  assert.equal(events[0]?.status, "running");
  assert.equal(events[0]?.terminal, false);
  assert.equal(events[0]?.updatedAt, "2026-09-18T05:46:00.000Z");
});


test("V56 execution-status resynchronizes from durable state after events are lost", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loop-v56-events-"));
  try {
    const store = createFileDurableExecutionStore({ directory });
    const result = await runDurableLoopExecution(
      store,
      {
        idempotencyKey: "cycle:v56:resync",
        project: "creatyss",
        owner: "worker-v56",
        leaseDurationMs: 60_000,
      },
      async (onProgress) => {
        onProgress(executingProgress());
        return completedResult("creatyss");
      },
      () => "2026-09-18T05:50:00.000Z",
      () => {
        // Simulate a consumer that misses every push event.
      },
    );
    assert.equal(result.status, "executed");

    const status = await buildExecutionStatusReport("creatyss", {
      directory,
      expectedDurationMs: null,
      nowMs: Date.parse("2026-09-18T05:51:00.000Z"),
    });
    assert.equal(status.execution?.state, "completed");
    assert.equal(status.execution?.runId, "run-v56");
    assert.equal(status.execution?.progress.percent, 100);
    assert.equal(status.execution?.timeline.at(-1)?.step, "provider");
    assert.equal(status.execution?.terminal?.status, "completed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

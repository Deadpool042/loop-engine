import assert from "node:assert/strict";
import { test } from "node:test";

import { createDurableExecutionControlPlane } from "../../src/composition/durable-execution-control-plane.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function completedResult(project: string): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-durable-1",
    project,
    mode: "execute",
    status: "completed",
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze(["src/result.ts"]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  });
}

test("durable control plane executes once and replays terminal result", async () => {
  const store = createInMemoryDurableExecutionStore();
  let calls = 0;
  const control = createDurableExecutionControlPlane(store, {
    now: (() => {
      const values = [
        "2026-07-31T00:00:00.000Z",
        "2026-07-31T00:00:01.000Z",
        "2026-07-31T00:00:02.000Z",
      ];
      return () => values.shift() ?? "2026-07-31T00:00:03.000Z";
    })(),
    runLoopExecute: async (project) => {
      calls += 1;
      return completedResult(project);
    },
  });
  const request = {
    idempotencyKey: "cycle:roadmap:42",
    project: "loop-engine",
    owner: "n8n-worker-1",
    leaseDurationMs: 60_000,
  } as const;

  const first = await control.execute(request);
  const replay = await control.execute(request);

  assert.equal(first.outcome.status, "executed");
  assert.equal(replay.outcome.status, "replayed");
  assert.equal(calls, 1);
  assert.equal(first.fingerprint?.algorithm, "sha256");
  assert.equal(first.outcome.status === "executed" && first.outcome.record.status, "completed");
});

test("active lease rejects concurrent owner without invoking provider", async () => {
  const store = createInMemoryDurableExecutionStore();
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const control = createDurableExecutionControlPlane(store, {
    now: () => "2026-07-31T00:00:00.000Z",
    runLoopExecute: async (project) => {
      calls += 1;
      await pending;
      return completedResult(project);
    },
  });

  const firstPromise = control.execute({
    idempotencyKey: "cycle:concurrent",
    project: "loop-engine",
    owner: "worker-a",
    leaseDurationMs: 60_000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await control.execute({
    idempotencyKey: "cycle:concurrent",
    project: "loop-engine",
    owner: "worker-b",
    leaseDurationMs: 60_000,
  });
  release?.();
  await firstPromise;

  assert.equal(second.outcome.status, "rejected");
  assert.equal(second.outcome.status === "rejected" && second.outcome.code, "execution_in_progress");
  assert.equal(calls, 1);
});

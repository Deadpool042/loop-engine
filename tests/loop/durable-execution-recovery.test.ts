import assert from "node:assert/strict";
import { test } from "node:test";

import {
  requestDurableExecutionCancellation,
  runDurableLoopExecution,
} from "../../src/loop/durable-execution-controller.js";
import {
  fingerprintDurableExecutionRecord,
  verifyDurableExecutionFingerprint,
} from "../../src/loop/durable-execution-integrity.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function failedResult(project: string): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-failed-1",
    project,
    mode: "execute",
    status: "failed",
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze([]),
    commit: null,
    publication: null,
    failure: Object.freeze({
      code: "validation_failed",
      message: "Validation failed.",
      details: Object.freeze(["bounded"]),
    }),
    agentPolicy: null,
    contextPackage: null,
  });
}

test("cancellation request is observed before terminal persistence", async () => {
  const store = createInMemoryDurableExecutionStore();
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const execution = runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:cancel",
      project: "loop-engine",
      owner: "worker-a",
      leaseDurationMs: 60_000,
    },
    async () => {
      await pending;
      return failedResult("loop-engine");
    },
    () => "2026-07-31T00:00:00.000Z",
  );
  await new Promise((resolve) => setImmediate(resolve));
  const cancellation = await requestDurableExecutionCancellation(
    store,
    "cycle:cancel",
    "supervisor",
    () => "2026-07-31T00:00:00.500Z",
  );
  release?.();
  const outcome = await execution;

  assert.equal(cancellation.status, "requested");
  assert.equal(outcome.status, "executed");
  assert.equal(outcome.status === "executed" && outcome.record.status, "cancelled");
  assert.equal(outcome.status === "executed" && outcome.record.result, null);
});

test("expired lease can be recovered and increments attempt", async () => {
  const store = createInMemoryDurableExecutionStore();
  const first = runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:recover",
      project: "loop-engine",
      owner: "worker-a",
      leaseDurationMs: 1,
    },
    async () => new Promise<LoopRunResult>(() => undefined),
    () => "2026-07-31T00:00:00.000Z",
  );
  await new Promise((resolve) => setImmediate(resolve));
  void first;

  const recovered = await runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:recover",
      project: "loop-engine",
      owner: "worker-b",
      leaseDurationMs: 60_000,
    },
    async () => failedResult("loop-engine"),
    () => "2026-07-31T00:00:01.000Z",
  );

  assert.equal(recovered.status, "executed");
  assert.equal(recovered.status === "executed" && recovered.record.attempt, 2);
  assert.equal(
    recovered.status === "executed" && recovered.record.events[1]?.type,
    "lease_recovered",
  );
});

test("durable fingerprint detects journal drift", async () => {
  const store = createInMemoryDurableExecutionStore();
  const outcome = await runDurableLoopExecution(
    store,
    {
      idempotencyKey: "cycle:fingerprint",
      project: "loop-engine",
      owner: "worker-a",
      leaseDurationMs: 60_000,
    },
    async () => failedResult("loop-engine"),
    () => "2026-07-31T00:00:00.000Z",
  );
  assert.equal(outcome.status, "executed");
  if (outcome.status !== "executed") return;
  const fingerprint = fingerprintDurableExecutionRecord(outcome.record);
  assert.equal(verifyDurableExecutionFingerprint(outcome.record, fingerprint), true);
  const drifted = Object.freeze({ ...outcome.record, attempt: 99 });
  assert.equal(verifyDurableExecutionFingerprint(drifted, fingerprint), false);
});

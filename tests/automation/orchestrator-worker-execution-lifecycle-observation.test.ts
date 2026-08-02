import assert from "node:assert/strict";
import test from "node:test";
import { validateAutomationOrchestratorWorkerExecutionLifecycleObservation } from "../../src/automation/index.js";
const lifecycle = () => ({
  status: "execution_started",
  reason: "receipt_confirmed",
  requestId: "r",
  delegationId: "d",
  candidateId: "c",
  targetId: "t",
  executionStarted: true,
});
const observation = (
  status: string,
  reason: string,
  a: boolean,
  b: boolean,
  c: boolean,
) => ({
  status,
  reason,
  requestId: "r",
  delegationId: "d",
  candidateId: "c",
  targetId: "t",
  executionStarted: a,
  executionFinished: b,
  executionSucceeded: c,
});
test("validates the closed lifecycle observation matrix", () => {
  for (const [o, status] of [
    [
      observation("running", "execution_running", true, false, false),
      "observation_accepted",
    ],
    [
      observation("completed", "execution_completed", true, true, true),
      "observation_accepted",
    ],
    [
      observation("failed", "execution_failed", true, true, false),
      "observation_accepted",
    ],
    [
      observation(
        "indeterminate",
        "execution_indeterminate",
        false,
        false,
        false,
      ),
      "observation_indeterminate",
    ],
  ] as const) {
    const out =
      validateAutomationOrchestratorWorkerExecutionLifecycleObservation(
        lifecycle() as never,
        o,
      );
    assert.equal(out.status, status);
    assert.equal(Object.isFrozen(out), true);
  }
});
test("fails closed for incompatible lifecycle, observations, flags, and identifiers", () => {
  const valid = observation("running", "execution_running", true, false, false);
  for (const [l, o] of [
    [{ ...lifecycle(), status: "execution_not_started" }, valid],
    [lifecycle(), null],
    [lifecycle(), { ...valid, status: "unknown" }],
    [lifecycle(), { ...valid, reason: "execution_failed" }],
    [lifecycle(), { ...valid, executionFinished: true }],
    [lifecycle(), { ...valid, requestId: "other" }],
  ]) {
    const out =
      validateAutomationOrchestratorWorkerExecutionLifecycleObservation(
        l as never,
        o,
      );
    assert.equal(out.status, "observation_rejected");
    assert.equal(out.executionStarted, false);
    assert.equal("executionId" in out, false);
  }
});

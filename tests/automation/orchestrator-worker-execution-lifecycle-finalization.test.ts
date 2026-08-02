import assert from "node:assert/strict";
import test from "node:test";
import { finalizeAutomationOrchestratorWorkerExecutionLifecycle } from "../../src/automation/index.js";

const progression = (
  status: string,
  reason: string,
  executionStarted: boolean,
  executionFinished: boolean,
  executionSucceeded: boolean,
) => ({
  status,
  reason,
  requestId: "Request",
  delegationId: "Delegation",
  candidateId: "Candidate",
  targetId: "Target",
  executionStarted,
  executionFinished,
  executionSucceeded,
});

test("finalizes the closed worker execution lifecycle progression matrix", () => {
  for (const [
    input,
    status,
    reason,
    started,
    finished,
    succeeded,
    finalized,
  ] of [
    [
      progression(
        "execution_completed",
        "observation_completed",
        true,
        true,
        true,
      ),
      "lifecycle_finalized",
      "execution_completed",
      true,
      true,
      true,
      true,
    ],
    [
      progression("execution_failed", "observation_failed", true, true, false),
      "lifecycle_finalized",
      "execution_failed",
      true,
      true,
      false,
      true,
    ],
    [
      progression(
        "execution_running",
        "observation_running",
        true,
        false,
        false,
      ),
      "lifecycle_active",
      "execution_running",
      true,
      false,
      false,
      false,
    ],
    [
      progression(
        "execution_indeterminate",
        "observation_indeterminate",
        false,
        false,
        false,
      ),
      "lifecycle_indeterminate",
      "execution_indeterminate",
      false,
      false,
      false,
      false,
    ],
  ] as const) {
    const output = finalizeAutomationOrchestratorWorkerExecutionLifecycle(
      input as never,
    );
    assert.deepEqual(output, {
      status,
      reason,
      requestId: "Request",
      delegationId: "Delegation",
      candidateId: "Candidate",
      targetId: "Target",
      executionStarted: started,
      executionFinished: finished,
      executionSucceeded: succeeded,
      lifecycleFinalized: finalized,
    });
    assert.equal(Object.isFrozen(output), true);
  }
});

test("rejects invalid progression shapes fail-closed", () => {
  const completed = progression(
    "execution_completed",
    "observation_completed",
    true,
    true,
    true,
  );
  const cases = [
    { ...completed, status: "progression_rejected" },
    { ...completed, status: "unknown" },
    { ...completed, reason: "observation_failed" },
    {
      ...progression(
        "execution_running",
        "observation_running",
        true,
        false,
        false,
      ),
      reason: "observation_completed",
    },
    { ...completed, executionSucceeded: false },
    {
      ...progression(
        "execution_failed",
        "observation_failed",
        true,
        true,
        false,
      ),
      executionSucceeded: true,
    },
    {
      ...progression(
        "execution_running",
        "observation_running",
        true,
        false,
        false,
      ),
      executionFinished: true,
    },
    {
      ...progression(
        "execution_indeterminate",
        "observation_indeterminate",
        false,
        false,
        false,
      ),
      executionStarted: true,
    },
    { ...completed, requestId: null },
    { ...completed, delegationId: null },
    { ...completed, candidateId: null },
    { ...completed, targetId: null },
  ];

  for (const input of cases) {
    const output = finalizeAutomationOrchestratorWorkerExecutionLifecycle(
      input as never,
    );
    assert.deepEqual(output, {
      status: "finalization_rejected",
      reason: "invalid_progression",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      executionStarted: false,
      executionFinished: false,
      executionSucceeded: false,
      lifecycleFinalized: false,
    });
  }
});

test("propagates identifiers exactly without mutating the progression", () => {
  const input = {
    ...progression(
      "execution_completed",
      "observation_completed",
      true,
      true,
      true,
    ),
    requestId: " Request ",
    delegationId: " Delegation ",
    candidateId: " Candidate ",
    targetId: " Target ",
  };
  const before = structuredClone(input);

  const first = finalizeAutomationOrchestratorWorkerExecutionLifecycle(input);
  const second = finalizeAutomationOrchestratorWorkerExecutionLifecycle(input);

  assert.deepEqual(first, second);
  assert.equal(first.requestId, " Request ");
  assert.equal(first.delegationId, " Delegation ");
  assert.equal(first.candidateId, " Candidate ");
  assert.equal(first.targetId, " Target ");
  assert.deepEqual(input, before);
  assert.equal("executionId" in first, false);
  assert.equal("dispatchId" in first, false);
  assert.equal("correlationId" in first, false);
  assert.equal("finalizedAt" in first, false);
  assert.equal("completedAt" in first, false);
  assert.equal("failedAt" in first, false);
});

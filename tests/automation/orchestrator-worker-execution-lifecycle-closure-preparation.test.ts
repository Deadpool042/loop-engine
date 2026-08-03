import assert from "node:assert/strict";
import test from "node:test";
import { prepareAutomationOrchestratorWorkerExecutionLifecycleClosure } from "../../src/automation/index.js";

const finalization = (
  status: string,
  reason: string,
  executionStarted: boolean,
  executionFinished: boolean,
  executionSucceeded: boolean,
  lifecycleFinalized: boolean,
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
  lifecycleFinalized,
});

test("prepares the closed worker execution lifecycle closure matrix", () => {
  for (const [
    input,
    status,
    reason,
    started,
    finished,
    succeeded,
    finalized,
    required,
  ] of [
    [
      finalization(
        "lifecycle_finalized",
        "execution_completed",
        true,
        true,
        true,
        true,
      ),
      "closure_ready",
      "completed_lifecycle",
      true,
      true,
      true,
      true,
      true,
    ],
    [
      finalization(
        "lifecycle_finalized",
        "execution_failed",
        true,
        true,
        false,
        true,
      ),
      "closure_ready",
      "failed_lifecycle",
      true,
      true,
      false,
      true,
      true,
    ],
    [
      finalization(
        "lifecycle_active",
        "execution_running",
        true,
        false,
        false,
        false,
      ),
      "closure_not_required",
      "active_lifecycle",
      true,
      false,
      false,
      false,
      false,
    ],
    [
      finalization(
        "lifecycle_indeterminate",
        "execution_indeterminate",
        false,
        false,
        false,
        false,
      ),
      "closure_indeterminate",
      "indeterminate_lifecycle",
      false,
      false,
      false,
      false,
      false,
    ],
  ] as const) {
    const output = prepareAutomationOrchestratorWorkerExecutionLifecycleClosure(
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
      closureRequired: required,
    });
    assert.equal(Object.isFrozen(output), true);
  }
});

test("rejects invalid finalization shapes fail-closed", () => {
  const completed = finalization(
    "lifecycle_finalized",
    "execution_completed",
    true,
    true,
    true,
    true,
  );
  const cases = [
    { ...completed, status: "finalization_rejected" },
    { ...completed, status: "unknown" },
    { ...completed, reason: "execution_failed" },
    {
      ...finalization(
        "lifecycle_active",
        "execution_running",
        true,
        false,
        false,
        false,
      ),
      reason: "execution_completed",
    },
    { ...completed, executionSucceeded: false },
    {
      ...finalization(
        "lifecycle_finalized",
        "execution_failed",
        true,
        true,
        false,
        true,
      ),
      executionSucceeded: true,
    },
    {
      ...finalization(
        "lifecycle_active",
        "execution_running",
        true,
        false,
        false,
        false,
      ),
      executionFinished: true,
    },
    {
      ...finalization(
        "lifecycle_indeterminate",
        "execution_indeterminate",
        false,
        false,
        false,
        false,
      ),
      lifecycleFinalized: true,
    },
    { ...completed, requestId: null },
    { ...completed, delegationId: null },
    { ...completed, candidateId: null },
    { ...completed, targetId: null },
  ];

  for (const input of cases) {
    const output = prepareAutomationOrchestratorWorkerExecutionLifecycleClosure(
      input as never,
    );
    assert.deepEqual(output, {
      status: "closure_rejected",
      reason: "invalid_finalization",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      executionStarted: false,
      executionFinished: false,
      executionSucceeded: false,
      lifecycleFinalized: false,
      closureRequired: false,
    });
  }
});

test("propagates identifiers exactly without mutating the finalization", () => {
  const input = {
    ...finalization(
      "lifecycle_finalized",
      "execution_completed",
      true,
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

  const first =
    prepareAutomationOrchestratorWorkerExecutionLifecycleClosure(input);
  const second =
    prepareAutomationOrchestratorWorkerExecutionLifecycleClosure(input);

  assert.deepEqual(first, second);
  assert.equal(first.requestId, " Request ");
  assert.equal(first.delegationId, " Delegation ");
  assert.equal(first.candidateId, " Candidate ");
  assert.equal(first.targetId, " Target ");
  assert.deepEqual(input, before);
  assert.equal("closureId" in first, false);
  assert.equal("executionId" in first, false);
  assert.equal("dispatchId" in first, false);
  assert.equal("correlationId" in first, false);
  assert.equal("preparedAt" in first, false);
  assert.equal("finalizedAt" in first, false);
  assert.equal("publishedAt" in first, false);
});

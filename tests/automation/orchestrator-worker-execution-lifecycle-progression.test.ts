import assert from "node:assert/strict";
import test from "node:test";
import { progressAutomationOrchestratorWorkerExecutionLifecycle } from "../../src/automation/index.js";

const lifecycle = () => ({
  status: "execution_started",
  reason: "receipt_confirmed",
  requestId: "Request",
  delegationId: "Delegation",
  candidateId: "Candidate",
  targetId: "Target",
  executionStarted: true,
});

const observationValidation = (
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

test("progresses the closed validated observation matrix", () => {
  for (const [validation, status, reason, started, finished, succeeded] of [
    [
      observationValidation(
        "observation_accepted",
        "execution_running",
        true,
        false,
        false,
      ),
      "execution_running",
      "observation_running",
      true,
      false,
      false,
    ],
    [
      observationValidation(
        "observation_accepted",
        "execution_completed",
        true,
        true,
        true,
      ),
      "execution_completed",
      "observation_completed",
      true,
      true,
      true,
    ],
    [
      observationValidation(
        "observation_accepted",
        "execution_failed",
        true,
        true,
        false,
      ),
      "execution_failed",
      "observation_failed",
      true,
      true,
      false,
    ],
    [
      observationValidation(
        "observation_indeterminate",
        "execution_indeterminate",
        false,
        false,
        false,
      ),
      "execution_indeterminate",
      "observation_indeterminate",
      false,
      false,
      false,
    ],
  ] as const) {
    const output = progressAutomationOrchestratorWorkerExecutionLifecycle(
      lifecycle(),
      validation as never,
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
    });
    assert.equal(Object.isFrozen(output), true);
  }
});

test("rejects invalid lifecycle and validation shapes fail-closed", () => {
  const validLifecycle = lifecycle();
  const running = observationValidation(
    "observation_accepted",
    "execution_running",
    true,
    false,
    false,
  );
  const cases = [
    [{ ...validLifecycle, status: "execution_not_started" }, running],
    [{ ...validLifecycle, reason: "receipt_not_started" }, running],
    [{ ...validLifecycle, executionStarted: false }, running],
    [{ ...validLifecycle, requestId: null }, running],
    [validLifecycle, { ...running, status: "observation_rejected" }],
    [validLifecycle, { ...running, reason: "execution_completed" }],
    [validLifecycle, { ...running, executionFinished: true }],
    [
      validLifecycle,
      observationValidation(
        "observation_accepted",
        "execution_completed",
        true,
        false,
        true,
      ),
    ],
    [
      validLifecycle,
      observationValidation(
        "observation_accepted",
        "execution_failed",
        true,
        true,
        true,
      ),
    ],
    [
      validLifecycle,
      observationValidation(
        "observation_indeterminate",
        "execution_indeterminate",
        true,
        false,
        false,
      ),
    ],
    [validLifecycle, { ...running, delegationId: null }],
  ];

  for (const [lifecycleInput, validationInput] of cases) {
    const output = progressAutomationOrchestratorWorkerExecutionLifecycle(
      lifecycleInput as never,
      validationInput as never,
    );
    assert.equal(output.status, "progression_rejected");
    assert.equal(output.executionStarted, false);
    assert.equal(output.executionFinished, false);
    assert.equal(output.executionSucceeded, false);
    assert.equal(output.requestId, null);
    assert.equal(output.delegationId, null);
    assert.equal(output.candidateId, null);
    assert.equal(output.targetId, null);
  }
});

test("rejects each identifier mismatch without transforming or mutating inputs", () => {
  const input = lifecycle();
  const validation = observationValidation(
    "observation_accepted",
    "execution_running",
    true,
    false,
    false,
  );
  const lifecycleBefore = structuredClone(input);
  const validationBefore = structuredClone(validation);

  for (const identifier of [
    "requestId",
    "delegationId",
    "candidateId",
    "targetId",
  ] as const) {
    const output = progressAutomationOrchestratorWorkerExecutionLifecycle(
      input,
      { ...validation, [identifier]: "Other" } as never,
    );
    assert.equal(output.status, "progression_rejected");
    assert.equal(output.reason, "identifier_mismatch");
  }

  const first = progressAutomationOrchestratorWorkerExecutionLifecycle(
    input,
    validation,
  );
  const second = progressAutomationOrchestratorWorkerExecutionLifecycle(
    input,
    validation,
  );
  assert.deepEqual(first, second);
  assert.deepEqual(input, lifecycleBefore);
  assert.deepEqual(validation, validationBefore);
  assert.equal("executionId" in first, false);
  assert.equal("dispatchId" in first, false);
  assert.equal("correlationId" in first, false);
});

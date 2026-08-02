import assert from "node:assert/strict";
import test from "node:test";
import { transitionAutomationOrchestratorWorkerExecutionLifecycle } from "../../src/automation/index.js";
const lifecycle = () =>
  ({
    status: "execution_pending",
    reason: "dispatch_accepted",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  }) as const;
const receipt = (
  status: string,
  reason: string,
  executionStarted: boolean,
) => ({
  status,
  reason,
  requestId: "Request",
  delegationId: "Delegation",
  candidateId: "Candidate",
  targetId: "Target",
  executionStarted,
});
test("transitions only coherent validated receipts", () => {
  for (const [value, expected, started] of [
    [
      receipt("receipt_accepted", "execution_started", true),
      "execution_started",
      true,
    ],
    [
      receipt("receipt_rejected", "execution_not_started", false),
      "execution_not_started",
      false,
    ],
    [
      receipt("receipt_indeterminate", "execution_indeterminate", false),
      "execution_indeterminate",
      false,
    ],
    [
      receipt("receipt_rejected", "invalid_receipt", false),
      "transition_rejected",
      false,
    ],
  ] as const) {
    const output = transitionAutomationOrchestratorWorkerExecutionLifecycle(
      lifecycle(),
      value as never,
    );
    assert.equal(output.status, expected);
    assert.equal(output.executionStarted, started);
    assert.equal(Object.isFrozen(output), true);
  }
});
test("rejects incompatible lifecycle, identifiers and flags without mutation", () => {
  const input = lifecycle();
  const validation = receipt("receipt_accepted", "execution_started", true);
  const original = structuredClone(input);
  for (const [lifecycleInput, validationInput] of [
    [{ ...input, status: "execution_not_started" }, validation],
    [input, { ...validation, requestId: "Other" }],
    [input, { ...validation, executionStarted: false }],
  ]) {
    const output = transitionAutomationOrchestratorWorkerExecutionLifecycle(
      lifecycleInput as never,
      validationInput as never,
    );
    assert.equal(output.status, "transition_rejected");
    assert.equal(output.executionStarted, false);
  }
  assert.deepEqual(input, original);
});

test("rejects every incoherent lifecycle, receipt, and identifier shape", () => {
  const valid = lifecycle();
  const confirmed = receipt("receipt_accepted", "execution_started", true);
  const cases = [
    [{ ...valid, reason: "invalid_lifecycle" }, confirmed],
    [{ ...valid, executionStarted: true }, confirmed],
    [{ ...valid, requestId: null }, confirmed],
    [valid, { ...confirmed, delegationId: "Other" }],
    [valid, { ...confirmed, candidateId: "Other" }],
    [valid, { ...confirmed, targetId: "Other" }],
    [valid, receipt("receipt_rejected", "execution_not_started", true)],
    [valid, receipt("receipt_indeterminate", "execution_indeterminate", true)],
    [valid, receipt("receipt_accepted", "invalid_receipt", true)],
    [valid, receipt("unknown", "execution_started", true)],
  ];
  for (const [lifecycleInput, validationInput] of cases) {
    const output = transitionAutomationOrchestratorWorkerExecutionLifecycle(
      lifecycleInput as never,
      validationInput as never,
    );
    assert.equal(output.status, "transition_rejected");
    assert.equal(output.executionStarted, false);
    assert.equal("executionId" in output, false);
    assert.equal("dispatchId" in output, false);
    assert.equal("correlationId" in output, false);
  }
});

test("is deterministic and never mutates its inputs", () => {
  const input = lifecycle();
  const validation = receipt("receipt_accepted", "execution_started", true);
  const lifecycleBefore = structuredClone(input);
  const validationBefore = structuredClone(validation);
  const first = transitionAutomationOrchestratorWorkerExecutionLifecycle(
    input,
    validation as never,
  );
  const second = transitionAutomationOrchestratorWorkerExecutionLifecycle(
    input,
    validation as never,
  );
  assert.deepEqual(first, second);
  assert.equal(first.executionStarted, true);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(input, lifecycleBefore);
  assert.deepEqual(validation, validationBefore);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  type AutomationOrchestratorWorkerExecutionStartServiceResult,
  validateAutomationOrchestratorWorkerExecutionStartReceipt,
} from "../../src/automation/index.js";

function service(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerExecutionStartServiceResult {
  return {
    status: "start_accepted",
    reason: "port_accepted",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    requestPrepared: true,
    startAttempted: true,
    executionStarted: false,
    ...overrides,
  } as AutomationOrchestratorWorkerExecutionStartServiceResult;
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    status: "started",
    reason: "execution_started",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    executionStarted: true,
    ...overrides,
  };
}

test("accepts only a coherent started receipt for an accepted service result", () => {
  const output = validateAutomationOrchestratorWorkerExecutionStartReceipt(
    service(),
    receipt(),
  );
  assert.deepEqual(output, {
    status: "receipt_accepted",
    reason: "execution_started",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    executionStarted: true,
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal("executionId" in output, false);
  assert.equal("dispatchId" in output, false);
  assert.equal("correlationId" in output, false);
});

test("closes non-started, indeterminate and incoherent receipts", () => {
  for (const [source, expectedStatus, expectedReason] of [
    [
      receipt({
        status: "not_started",
        reason: "execution_not_started",
        executionStarted: false,
      }),
      "receipt_rejected",
      "execution_not_started",
    ],
    [
      receipt({
        status: "indeterminate",
        reason: "execution_indeterminate",
        executionStarted: false,
      }),
      "receipt_indeterminate",
      "execution_indeterminate",
    ],
    [
      receipt({ executionStarted: false }),
      "receipt_rejected",
      "invalid_receipt",
    ],
    [
      receipt({ requestId: "Other" }),
      "receipt_rejected",
      "identifier_mismatch",
    ],
    [null, "receipt_rejected", "invalid_receipt"],
  ] as const) {
    const output = validateAutomationOrchestratorWorkerExecutionStartReceipt(
      service(),
      source,
    );
    assert.equal(output.status, expectedStatus);
    assert.equal(output.reason, expectedReason);
    assert.equal(output.executionStarted, false);
  }
});

test("rejects a started receipt from rejected or indeterminate service results without mutation", () => {
  for (const input of [
    service({ status: "start_rejected", reason: "port_rejected" }),
    service({ status: "start_indeterminate", reason: "port_indeterminate" }),
  ]) {
    const original = structuredClone(input);
    const output = validateAutomationOrchestratorWorkerExecutionStartReceipt(
      input,
      receipt(),
    );
    assert.equal(output.status, "receipt_rejected");
    assert.equal(output.executionStarted, false);
    assert.deepEqual(input, original);
  }
});

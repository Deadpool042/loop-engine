import assert from "node:assert/strict";
import test from "node:test";
import {
  initializeAutomationOrchestratorWorkerExecutionLifecycle,
  type AutomationOrchestratorWorkerDispatchServiceResult,
} from "../../src/automation/index.js";

function input(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerDispatchServiceResult {
  return {
    status: "accepted",
    reason: "dispatch_accepted",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    requestPrepared: true,
    dispatchAttempted: true,
    dispatchOccurred: true,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  } as AutomationOrchestratorWorkerDispatchServiceResult;
}
test("maps the closed V20.9 matrix without starting execution", () => {
  for (const [value, status, reason] of [
    [input(), "execution_pending", "dispatch_accepted"],
    [
      input({
        status: "rejected",
        reason: "dispatch_rejected",
        dispatchOccurred: false,
      }),
      "execution_not_started",
      "dispatch_rejected",
    ],
    [
      input({
        status: "indeterminate",
        reason: "dispatch_indeterminate",
        dispatchOccurred: false,
      }),
      "execution_indeterminate",
      "dispatch_indeterminate",
    ],
    [
      input({
        status: "rejected",
        reason: "command_rejected",
        requestPrepared: false,
        dispatchAttempted: false,
        dispatchOccurred: false,
      }),
      "execution_not_started",
      "command_rejected",
    ],
    [
      input({
        status: "rejected",
        reason: "invalid_command",
        requestId: null,
        delegationId: null,
        candidateId: null,
        targetId: null,
        requestPrepared: false,
        dispatchAttempted: false,
        dispatchOccurred: false,
      }),
      "execution_not_started",
      "invalid_command",
    ],
    [
      input({
        status: "indeterminate",
        reason: "port_failed",
        requestId: null,
        delegationId: null,
        candidateId: null,
        targetId: null,
        dispatchOccurred: false,
      }),
      "execution_not_started",
      "port_failed",
    ],
    [
      input({
        status: "indeterminate",
        reason: "invalid_port_result",
        requestId: null,
        delegationId: null,
        candidateId: null,
        targetId: null,
        dispatchOccurred: false,
      }),
      "execution_not_started",
      "invalid_port_result",
    ],
  ] as const) {
    const output =
      initializeAutomationOrchestratorWorkerExecutionLifecycle(value);
    assert.equal(output.status, status);
    assert.equal(output.reason, reason);
    assert.equal(output.executionStarted, false);
    assert.equal(Object.isFrozen(output), true);
  }
});
test("fails closed without mutation for missing identifiers, incoherent flags, and unknown values", () => {
  for (const value of [
    input({ requestId: null }),
    input({ executionStarted: true }),
    input({ dispatchOccurred: false }),
    { status: "accepted" },
  ]) {
    const before = structuredClone(value);
    const output = initializeAutomationOrchestratorWorkerExecutionLifecycle(
      value as never,
    );
    assert.deepEqual(value, before);
    assert.equal(output.status, "execution_not_started");
    assert.equal(output.requestId, null);
  }
});
test("preserves exact identifiers only for coherent states and is deterministic", () => {
  const value = input({
    requestId: "",
    delegationId: "  ",
    candidateId: "CaSe",
    targetId: "",
  });
  const one = initializeAutomationOrchestratorWorkerExecutionLifecycle(value);
  const two = initializeAutomationOrchestratorWorkerExecutionLifecycle(value);
  assert.deepEqual(one, two);
  assert.equal(one.delegationId, "  ");
  assert.equal(one.candidateId, "CaSe");
  assert.equal(one.dispatchOccurred, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareAutomationOrchestratorWorkerExecutionStartRequest,
  type AutomationOrchestratorWorkerExecutionLifecycleInitializationResult,
} from "../../src/automation/index.js";
function input(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerExecutionLifecycleInitializationResult {
  return {
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
    ...overrides,
  } as AutomationOrchestratorWorkerExecutionLifecycleInitializationResult;
}
test("prepares only coherent pending lifecycles", () => {
  const output =
    prepareAutomationOrchestratorWorkerExecutionStartRequest(input());
  assert.equal(output.status, "request_prepared");
  assert.deepEqual(output.request, {
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    executionStarted: false,
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.request), true);
});
test("uses the closed matrix and never starts execution", () => {
  for (const value of [
    input({ requestId: null }),
    input({ workerSelected: true }),
    input({ status: "execution_not_started", reason: "port_failed" }),
    input({
      status: "execution_indeterminate",
      reason: "dispatch_indeterminate",
    }),
    { status: "execution_pending" },
  ]) {
    const before = structuredClone(value);
    const output = prepareAutomationOrchestratorWorkerExecutionStartRequest(
      value as never,
    );
    assert.deepEqual(value, before);
    assert.equal(output.executionStarted, false);
    if ((value as { status?: string }).status === "execution_indeterminate")
      assert.equal(output.status, "request_indeterminate");
    else assert.equal(output.status, "request_rejected");
  }
});
test("is deterministic and preserves exact canonical identifiers", () => {
  const value = input({
    requestId: "",
    delegationId: "  ",
    candidateId: "CaSe",
    targetId: "",
  });
  assert.deepEqual(
    prepareAutomationOrchestratorWorkerExecutionStartRequest(value),
    prepareAutomationOrchestratorWorkerExecutionStartRequest(value),
  );
  assert.equal(
    prepareAutomationOrchestratorWorkerExecutionStartRequest(value).request
      ?.delegationId,
    "  ",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchAutomationOrchestratorWorkerExecutionStart,
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
function port(status: string, reason: string) {
  return {
    start: async () =>
      ({
        status,
        reason,
        requestId: "Request",
        delegationId: "Delegation",
        candidateId: "Candidate",
        targetId: "Target",
        startRequested: status === "accepted",
        executionStarted: false,
      }) as never,
  };
}
test("composes prepared requests with accepted rejected and indeterminate invocation", async () => {
  for (const [status, reason, expected] of [
    ["accepted", "adapter_accepted", "start_accepted"],
    ["rejected", "adapter_rejected", "start_rejected"],
    ["indeterminate", "adapter_indeterminate", "start_indeterminate"],
  ]) {
    const output = await dispatchAutomationOrchestratorWorkerExecutionStart(
      input(),
      port(status, reason),
    );
    assert.equal(output.status, expected);
    assert.equal(output.executionStarted, false);
    assert.equal(Object.isFrozen(output), true);
  }
});
test("does not invoke when preparation rejects or is indeterminate", async () => {
  let calls = 0;
  const p = {
    start: async () => {
      calls++;
      return {} as never;
    },
  };
  for (const value of [
    input({ status: "execution_not_started", reason: "port_failed" }),
    input({
      status: "execution_indeterminate",
      reason: "dispatch_indeterminate",
    }),
  ]) {
    const out = await dispatchAutomationOrchestratorWorkerExecutionStart(
      value,
      p,
    );
    assert.equal(out.startAttempted, false);
  }
  assert.equal(calls, 0);
});

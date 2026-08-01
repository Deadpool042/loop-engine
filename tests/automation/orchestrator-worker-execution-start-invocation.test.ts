import assert from "node:assert/strict";
import test from "node:test";
import {
  invokeAutomationOrchestratorWorkerExecutionStart,
  type AutomationOrchestratorWorkerExecutionStartRequest,
} from "../../src/automation/index.js";
function request(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerExecutionStartRequest {
  return {
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    executionStarted: false,
    ...overrides,
  } as AutomationOrchestratorWorkerExecutionStartRequest;
}
function port(
  status: string,
  reason: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    status,
    reason,
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    startRequested: status === "accepted",
    executionStarted: false,
    ...overrides,
  };
}
test("normalizes accepted rejected and indeterminate start outcomes once", async () => {
  for (const [status, reason, expected] of [
    ["accepted", "adapter_accepted", "port_accepted"],
    ["rejected", "adapter_rejected", "port_rejected"],
    ["indeterminate", "adapter_indeterminate", "port_indeterminate"],
  ]) {
    let calls = 0;
    const output = await invokeAutomationOrchestratorWorkerExecutionStart(
      request(),
      {
        start: async () => {
          calls++;
          return port(status, reason) as never;
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(output.reason, expected);
    assert.equal(output.executionStarted, false);
    assert.equal(Object.isFrozen(output), true);
  }
});
test("fails closed without call for invalid requests and port failures", async () => {
  let calls = 0;
  const invalid = await invokeAutomationOrchestratorWorkerExecutionStart(
    request({ executionStarted: true }),
    {
      start: async () => {
        calls++;
        return port("accepted", "adapter_accepted") as never;
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(invalid.reason, "request_invalid");
  for (const value of [
    null,
    port("accepted", "adapter_accepted", { requestId: "other" }),
  ]) {
    const out = await invokeAutomationOrchestratorWorkerExecutionStart(
      request(),
      { start: async () => value as never },
    );
    assert.equal(out.reason, "invalid_port_result");
  }
  const failed = await invokeAutomationOrchestratorWorkerExecutionStart(
    request(),
    { start: async () => Promise.reject(new Error("x")) },
  );
  assert.equal(failed.reason, "port_failed");
});

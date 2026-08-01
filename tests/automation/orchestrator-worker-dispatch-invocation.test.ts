import assert from "node:assert/strict";
import test from "node:test";

import {
  invokeAutomationOrchestratorWorkerDispatch,
  type AutomationOrchestratorWorkerDispatchPort,
  type AutomationOrchestratorWorkerDispatchRequest,
  type AutomationOrchestratorWorkerDispatchResult,
} from "../../src/automation/index.js";

function request(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerDispatchRequest {
  return {
    status: "prepared",
    prepared: true,
    reason: "command_prepared",
    kind: "execute_delegated_task",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    dispatchRequested: false,
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  } as AutomationOrchestratorWorkerDispatchRequest;
}
function result(
  status: AutomationOrchestratorWorkerDispatchResult["status"],
  reason: AutomationOrchestratorWorkerDispatchResult["reason"],
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerDispatchResult {
  return {
    status,
    reason,
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
    dispatchOccurred: status === "accepted",
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  };
}
test("invokes a valid injected port exactly once and normalizes accepted, rejected, and indeterminate outcomes", async () => {
  for (const [status, reason, expected] of [
    ["accepted", "adapter_accepted", "port_accepted"],
    ["rejected", "adapter_rejected", "port_rejected"],
    ["indeterminate", "adapter_indeterminate", "port_indeterminate"],
  ] as const) {
    let calls = 0;
    const port: AutomationOrchestratorWorkerDispatchPort = {
      dispatch: async (value) => {
        calls += 1;
        assert.equal(value, input);
        return result(status, reason);
      },
    };
    const input = request();
    const output = await invokeAutomationOrchestratorWorkerDispatch(
      input,
      port,
    );
    assert.equal(calls, 1);
    assert.equal(output.reason, expected);
    assert.equal(Object.isFrozen(output), true);
  }
});
test("rejects invalid requests without invoking the port", async () => {
  for (const input of [
    request({ prepared: false }),
    request({ kind: null }),
    request({ requestId: null }),
    request({ dispatchOccurred: true }),
  ]) {
    let calls = 0;
    const output = await invokeAutomationOrchestratorWorkerDispatch(input, {
      dispatch: async () => {
        calls += 1;
        return result("accepted", "adapter_accepted");
      },
    });
    assert.equal(output.reason, "invalid_request");
    assert.equal(calls, 0);
  }
});
test("normalizes malformed results and port failures fail-closed", async () => {
  const cases: readonly [unknown, string][] = [
    [null, "invalid_port_result"],
    [
      result("accepted", "adapter_accepted", { dispatchOccurred: false }),
      "invalid_port_result",
    ],
    [
      result("rejected", "adapter_rejected", { executionStarted: true }),
      "invalid_port_result",
    ],
    [result("accepted", "adapter_rejected"), "invalid_port_result"],
    [
      result("accepted", "adapter_accepted", { requestId: "other" }),
      "invalid_port_result",
    ],
  ];
  for (const [value, expected] of cases) {
    const output = await invokeAutomationOrchestratorWorkerDispatch(request(), {
      dispatch: async () => value as AutomationOrchestratorWorkerDispatchResult,
    });
    assert.equal(output.reason, expected);
    assert.equal(output.dispatchAttempted, true);
  }
  for (const port of [
    {
      dispatch: () => {
        throw new Error("hidden");
      },
    },
    { dispatch: async () => Promise.reject(new Error("hidden")) },
    {},
  ]) {
    const output = await invokeAutomationOrchestratorWorkerDispatch(
      request(),
      port as AutomationOrchestratorWorkerDispatchPort,
    );
    assert.equal(output.reason, "port_failed");
  }
});
test("preserves exact identifiers without mutation", async () => {
  const input = request({
    requestId: "",
    delegationId: "   ",
    candidateId: "Cased",
    targetId: "",
  });
  const before = structuredClone(input);
  const output = await invokeAutomationOrchestratorWorkerDispatch(input, {
    dispatch: async () =>
      result("accepted", "adapter_accepted", {
        requestId: "",
        delegationId: "   ",
        candidateId: "Cased",
        targetId: "",
      }),
  });
  assert.deepEqual(input, before);
  assert.equal(output.delegationId, "   ");
  assert.equal(output.candidateId, "Cased");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareAutomationOrchestratorWorkerDispatchRequest,
  type AutomationOrchestratorWorkerCommand,
  type AutomationOrchestratorWorkerDispatchPort,
} from "../../src/automation/index.js";

function command(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerCommand {
  return {
    status: "prepared",
    prepared: true,
    reason: "handoff_prepared",
    kind: "execute_delegated_task",
    requestId: "request",
    delegationId: "delegation",
    candidateId: "candidate",
    targetId: "target",
    workerSelected: false,
    commandDispatched: false,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  } as AutomationOrchestratorWorkerCommand;
}

test("prepares only coherent Worker Commands and preserves identifiers", () => {
  const result = prepareAutomationOrchestratorWorkerDispatchRequest(command());
  assert.deepEqual(result, {
    status: "prepared",
    prepared: true,
    reason: "command_prepared",
    kind: "execute_delegated_task",
    requestId: "request",
    delegationId: "delegation",
    candidateId: "candidate",
    targetId: "target",
    dispatchRequested: false,
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
  assert.equal(Object.isFrozen(result), true);
});

test("rejects invalid or operational commands fail-closed", () => {
  for (const input of [
    command({ prepared: false }),
    command({ reason: "other" }),
    command({ kind: null }),
    command({ requestId: null }),
    command({ candidateId: 1 }),
    command({ dispatchOccurred: true }),
    command({ dispatchRequested: true }),
    {} as AutomationOrchestratorWorkerCommand,
  ]) {
    const result = prepareAutomationOrchestratorWorkerDispatchRequest(input);
    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "invalid_command");
    assert.equal(result.kind, null);
    assert.equal(result.requestId, null);
  }
});

test("preserves coherent rejection and exact empty identifiers without mutation", () => {
  const input = command({
    status: "rejected",
    prepared: false,
    reason: "handoff_rejected",
    kind: null,
    requestId: "",
    delegationId: "   ",
    candidateId: "",
    targetId: "   ",
  });
  const before = structuredClone(input);
  const one = prepareAutomationOrchestratorWorkerDispatchRequest(input);
  assert.equal(one.reason, "command_rejected");
  assert.deepEqual(
    one,
    prepareAutomationOrchestratorWorkerDispatchRequest(input),
  );
  assert.deepEqual(input, before);
  assert.equal(one.requestId, "");
  assert.equal(one.delegationId, "   ");
});

test("defines a compatible dispatch port without invoking it", () => {
  const port: AutomationOrchestratorWorkerDispatchPort = {
    dispatch: async () => {
      throw new Error("must not be invoked");
    },
  };
  assert.equal(typeof port.dispatch, "function");
});

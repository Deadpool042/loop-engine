import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchAutomationOrchestratorWorkerCommand,
  type AutomationOrchestratorWorkerCommand,
  type AutomationOrchestratorWorkerDispatchPort,
  type AutomationOrchestratorWorkerDispatchResult,
} from "../../src/automation/index.js";

function command(
  overrides: Record<string, unknown> = {},
): AutomationOrchestratorWorkerCommand {
  return {
    status: "prepared",
    prepared: true,
    reason: "handoff_prepared",
    kind: "execute_delegated_task",
    requestId: "Request",
    delegationId: "Delegation",
    candidateId: "Candidate",
    targetId: "Target",
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

function portResult(
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
  } as AutomationOrchestratorWorkerDispatchResult;
}

test("composes a prepared command with accepted, rejected, and indeterminate invocations", async () => {
  for (const [status, reason, expected] of [
    ["accepted", "adapter_accepted", "dispatch_accepted"],
    ["rejected", "adapter_rejected", "dispatch_rejected"],
    ["indeterminate", "adapter_indeterminate", "dispatch_indeterminate"],
  ] as const) {
    let calls = 0;
    const input = command();
    const output = await dispatchAutomationOrchestratorWorkerCommand(input, {
      dispatch: async (request) => {
        calls += 1;
        assert.equal(request.requestId, "Request");
        return portResult(status, reason);
      },
    });
    assert.equal(calls, 1);
    assert.equal(output.status, status);
    assert.equal(output.reason, expected);
    assert.equal(output.requestPrepared, true);
    assert.equal(output.dispatchAttempted, true);
    assert.equal(Object.isFrozen(output), true);
  }
});

test("normalizes malformed results, thrown ports, rejected promises, absent and malformed ports", async () => {
  const cases: readonly [AutomationOrchestratorWorkerDispatchPort, string][] = [
    [{ dispatch: async () => null as never }, "invalid_port_result"],
    [
      {
        dispatch: () => {
          throw new Error("hidden");
        },
      },
      "port_failed",
    ],
    [
      { dispatch: async () => Promise.reject(new Error("hidden")) },
      "port_failed",
    ],
    [{} as AutomationOrchestratorWorkerDispatchPort, "port_failed"],
  ];
  for (const [port, reason] of cases) {
    const output = await dispatchAutomationOrchestratorWorkerCommand(
      command(),
      port,
    );
    assert.equal(output.status, "indeterminate");
    assert.equal(output.reason, reason);
    assert.equal(output.requestPrepared, true);
    assert.deepEqual(
      [
        output.requestId,
        output.delegationId,
        output.candidateId,
        output.targetId,
      ],
      [null, null, null, null],
    );
    assert.equal(output.dispatchOccurred, false);
    assert.equal(output.executionStarted, false);
  }
});

test("does not invoke a port for rejected, invalid, malformed, or contaminated commands", async () => {
  for (const input of [
    command({
      status: "rejected",
      prepared: false,
      reason: "handoff_rejected",
      kind: null,
    }),
    command({ kind: "other_kind" }),
    command({ requestId: null }),
    command({ workerSelected: true }),
  ]) {
    let calls = 0;
    const output = await dispatchAutomationOrchestratorWorkerCommand(input, {
      dispatch: async () => {
        calls += 1;
        return portResult("accepted", "adapter_accepted");
      },
    });
    assert.equal(calls, 0);
    assert.equal(output.dispatchAttempted, false);
    assert.equal(output.requestPrepared, false);
    assert.equal(
      output.reason,
      input.reason === "handoff_rejected"
        ? "command_rejected"
        : "invalid_command",
    );
  }
});

test("preserves empty, whitespace, and cased identifiers without mutating command or request", async () => {
  const input = command({
    requestId: "",
    delegationId: "   ",
    candidateId: "CaSeD",
    targetId: "",
  });
  const before = structuredClone(input);
  let received: unknown;
  const output = await dispatchAutomationOrchestratorWorkerCommand(input, {
    dispatch: async (request) => {
      received = structuredClone(request);
      return portResult("accepted", "adapter_accepted", {
        requestId: "",
        delegationId: "   ",
        candidateId: "CaSeD",
        targetId: "",
      });
    },
  });
  assert.deepEqual(input, before);
  assert.deepEqual(received, {
    status: "prepared",
    prepared: true,
    reason: "command_prepared",
    kind: "execute_delegated_task",
    requestId: "",
    delegationId: "   ",
    candidateId: "CaSeD",
    targetId: "",
    dispatchRequested: false,
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
  assert.equal(output.delegationId, "   ");
  assert.equal(output.candidateId, "CaSeD");
});

test("preserves accepted flags and keeps rejected execution unstarted without retry", async () => {
  let calls = 0;
  const accepted = await dispatchAutomationOrchestratorWorkerCommand(
    command(),
    {
      dispatch: async () => {
        calls += 1;
        return portResult("accepted", "adapter_accepted", {
          workerSelected: true,
          providerInvoked: true,
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(accepted.workerSelected, true);
  assert.equal(accepted.providerInvoked, true);
  const rejected = await dispatchAutomationOrchestratorWorkerCommand(
    command(),
    {
      dispatch: async () => portResult("rejected", "adapter_rejected"),
    },
  );
  assert.equal(rejected.executionStarted, false);
});

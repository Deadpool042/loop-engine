import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareAutomationOrchestratorWorkerCommand } from "../../src/automation/orchestrator/index.js";

function handoff(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    status: "prepared",
    prepared: true,
    reason: "admission_accepted",
    progression: "dispatch",
    requestId: "Request-ID",
    delegationId: "Delegation-ID",
    candidateId: "Candidate-ID",
    targetId: "Target-ID",
    workerSelected: false,
    commandCreated: false,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  };
}

function rejectedHandoff() {
  return handoff({
    status: "rejected",
    prepared: false,
    reason: "admission_rejected",
  });
}

function assertInvalid(value: unknown): void {
  const result = prepareAutomationOrchestratorWorkerCommand(value as never);
  assert.deepEqual(
    {
      status: result.status,
      prepared: result.prepared,
      reason: result.reason,
      kind: result.kind,
      requestId: result.requestId,
      delegationId: result.delegationId,
      candidateId: result.candidateId,
      targetId: result.targetId,
    },
    {
      status: "rejected",
      prepared: false,
      reason: "invalid_handoff",
      kind: null,
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
    },
  );
}

test("a coherent prepared handoff creates a frozen declarative command", () => {
  const source = handoff();
  const before = structuredClone(source);
  const result = prepareAutomationOrchestratorWorkerCommand(source as never);

  assert.equal(result.status, "prepared");
  assert.equal(result.prepared, true);
  assert.equal(result.reason, "handoff_prepared");
  assert.equal(result.kind, "execute_delegated_task");
  assert.equal(result.requestId, "Request-ID");
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(source, before);
  assert.deepEqual(
    result,
    prepareAutomationOrchestratorWorkerCommand(source as never),
  );
  assert.deepEqual(
    {
      workerSelected: result.workerSelected,
      commandDispatched: result.commandDispatched,
      dispatchOccurred: result.dispatchOccurred,
      delegationOccurred: result.delegationOccurred,
      providerInvoked: result.providerInvoked,
      forgeInvoked: result.forgeInvoked,
      executionStarted: result.executionStarted,
    },
    {
      workerSelected: false,
      commandDispatched: false,
      dispatchOccurred: false,
      delegationOccurred: false,
      providerInvoked: false,
      forgeInvoked: false,
      executionStarted: false,
    },
  );
});

test("a coherent rejected handoff remains a rejected command", () => {
  const result = prepareAutomationOrchestratorWorkerCommand(
    rejectedHandoff() as never,
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.prepared, false);
  assert.equal(result.reason, "handoff_rejected");
  assert.equal(result.kind, null);
});

test("worker command rejects contradictory, partial, and operational handoffs", () => {
  const invalid = [
    handoff({ prepared: false }),
    handoff({ status: "rejected", prepared: true }),
    handoff({ reason: "admission_rejected" }),
    handoff({ progression: "selection" }),
    handoff({ requestId: null }),
    handoff({ delegationId: 1 }),
    handoff({ candidateId: null }),
    handoff({ targetId: 1 }),
    handoff({ commandCreated: true }),
    handoff({ commandDispatched: true }),
    ...[
      "workerSelected",
      "dispatchOccurred",
      "delegationOccurred",
      "providerInvoked",
      "forgeInvoked",
      "executionStarted",
    ].map((flag) => handoff({ [flag]: true })),
    null,
    {},
    { status: "unknown", prepared: false },
    { status: "rejected", prepared: false, reason: "unknown" },
  ];
  for (const source of invalid) assertInvalid(source);
});

test("worker command preserves exact empty, whitespace, and case-sensitive identifiers", () => {
  for (const identifiers of [
    { requestId: "", delegationId: "", candidateId: "", targetId: "" },
    {
      requestId: "   ",
      delegationId: "   ",
      candidateId: "   ",
      targetId: "   ",
    },
    {
      requestId: "Request-ID",
      delegationId: "Delegation-ID",
      candidateId: "Candidate-ID",
      targetId: "Target-ID",
    },
  ]) {
    const result = prepareAutomationOrchestratorWorkerCommand(
      handoff(identifiers) as never,
    );
    assert.equal(result.status, "prepared");
    assert.equal(result.kind, "execute_delegated_task");
    assert.equal(result.requestId, identifiers.requestId);
    assert.equal(result.delegationId, identifiers.delegationId);
    assert.equal(result.candidateId, identifiers.candidateId);
    assert.equal(result.targetId, identifiers.targetId);
  }
});

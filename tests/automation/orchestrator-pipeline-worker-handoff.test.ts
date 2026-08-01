import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareAutomationOrchestratorPipelineWorkerHandoff } from "../../src/automation/orchestrator/index.js";

function admission(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    status: "admitted",
    admitted: true,
    reason: "dispatch_prepared",
    progression: "dispatch",
    requestId: "Request-ID",
    delegationId: "Delegation-ID",
    candidateId: "Candidate-ID",
    targetId: "Target-ID",
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    ...overrides,
  };
}

function rejectedAdmission(
  status: "rejected" | "indeterminate",
): Record<string, unknown> {
  return admission({
    status,
    admitted: false,
    reason:
      status === "rejected" ? "pipeline_rejected" : "pipeline_indeterminate",
  });
}

function assertInvalid(value: unknown): void {
  const result = prepareAutomationOrchestratorPipelineWorkerHandoff(
    value as never,
  );
  assert.deepEqual(
    {
      status: result.status,
      prepared: result.prepared,
      reason: result.reason,
      progression: result.progression,
      requestId: result.requestId,
      delegationId: result.delegationId,
      candidateId: result.candidateId,
      targetId: result.targetId,
    },
    {
      status: "rejected",
      prepared: false,
      reason: "invalid_admission",
      progression: null,
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
    },
  );
}

test("a complete admitted decision prepares a frozen declarative worker handoff", () => {
  const source = admission();
  const before = structuredClone(source);
  const result = prepareAutomationOrchestratorPipelineWorkerHandoff(
    source as never,
  );

  assert.equal(result.status, "prepared");
  assert.equal(result.prepared, true);
  assert.equal(result.reason, "admission_accepted");
  assert.equal(result.progression, "dispatch");
  assert.equal(result.requestId, "Request-ID");
  assert.equal(result.delegationId, "Delegation-ID");
  assert.equal(result.candidateId, "Candidate-ID");
  assert.equal(result.targetId, "Target-ID");
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(source, before);
  assert.deepEqual(
    result,
    prepareAutomationOrchestratorPipelineWorkerHandoff(source as never),
  );
  assert.deepEqual(
    {
      workerSelected: result.workerSelected,
      commandCreated: result.commandCreated,
      dispatchOccurred: result.dispatchOccurred,
      delegationOccurred: result.delegationOccurred,
      providerInvoked: result.providerInvoked,
      forgeInvoked: result.forgeInvoked,
      executionStarted: result.executionStarted,
    },
    {
      workerSelected: false,
      commandCreated: false,
      dispatchOccurred: false,
      delegationOccurred: false,
      providerInvoked: false,
      forgeInvoked: false,
      executionStarted: false,
    },
  );
});

test("rejected and indeterminate coherent admissions remain rejected", () => {
  for (const status of ["rejected", "indeterminate"] as const) {
    const result = prepareAutomationOrchestratorPipelineWorkerHandoff(
      rejectedAdmission(status) as never,
    );
    assert.equal(result.status, "rejected");
    assert.equal(result.prepared, false);
    assert.equal(result.reason, "admission_rejected");
    assert.equal(result.progression, "dispatch");
  }
});

test("worker handoff rejects every contradictory admission shape", () => {
  const invalid = [
    admission({ admitted: false }),
    admission({ status: "rejected", admitted: true }),
    admission({ status: "indeterminate", admitted: true }),
    admission({ reason: "pipeline_rejected" }),
    admission({ progression: "selection" }),
    admission({ requestId: null }),
    admission({ delegationId: 1 }),
    admission({ candidateId: null }),
    admission({ targetId: 1 }),
    admission({ workerSelected: true }),
    admission({ commandCreated: true }),
    ...[
      "dispatchOccurred",
      "delegationOccurred",
      "providerInvoked",
      "forgeInvoked",
      "executionStarted",
    ].map((flag) => admission({ [flag]: true })),
    null,
    {},
    { status: "admitted", admitted: true },
  ];

  for (const source of invalid) assertInvalid(source);
});

test("worker handoff preserves empty, whitespace, and case-sensitive identifiers", () => {
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
    const result = prepareAutomationOrchestratorPipelineWorkerHandoff(
      admission(identifiers) as never,
    );
    assert.equal(result.status, "prepared");
    assert.equal(result.requestId, identifiers.requestId);
    assert.equal(result.delegationId, identifiers.delegationId);
    assert.equal(result.candidateId, identifiers.candidateId);
    assert.equal(result.targetId, identifiers.targetId);
  }
});

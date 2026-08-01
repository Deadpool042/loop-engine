import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAutomationOrchestratorPipelineAdmission } from "../../src/automation/orchestrator/index.js";

function summary(dispatchStatus: string = "prepared") {
  const stage = (
    status: string,
    candidateId: string | null,
    targetId: string | null,
  ) => ({
    status,
    requestId: "request",
    delegationId: "delegation",
    candidateId,
    targetId,
    evidenceCount: 0,
    findingCount: 0,
    failureCount: 0,
  });
  return {
    status: "valid",
    valid: true,
    progression: "dispatch",
    validationSubjectStatus: "complete",
    evaluation: stage("eligible", null, null),
    selection: stage("selected", "candidate", null),
    dispatch: stage(dispatchStatus, "candidate", "target"),
    requestId: "request",
    delegationId: "delegation",
    candidateId: "candidate",
    targetId: "target",
    counts: { diagnostics: 0, findings: 0, failures: 0, evidence: 0 },
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  };
}

function evaluationSummary(status: string = "denied") {
  const source = summary();
  return {
    ...source,
    progression: "evaluation",
    evaluation: {
      ...source.evaluation,
      status,
      candidateId: null,
      targetId: null,
    },
    selection: null,
    dispatch: null,
    candidateId: null,
    targetId: null,
  };
}

function selectionSummary(status: string = "rejected") {
  const source = summary();
  return {
    ...source,
    progression: "selection",
    selection: {
      ...source.selection,
      status,
      targetId: null,
    },
    dispatch: null,
    targetId: null,
  };
}

function withIdentifiers(
  source: ReturnType<typeof summary>,
  identifiers: Readonly<{
    requestId: string;
    delegationId: string;
    candidateId: string;
    targetId: string;
  }>,
) {
  return {
    ...source,
    ...identifiers,
    evaluation: {
      ...source.evaluation,
      requestId: identifiers.requestId,
      delegationId: identifiers.delegationId,
      candidateId: null,
      targetId: null,
    },
    selection: {
      ...source.selection,
      requestId: identifiers.requestId,
      delegationId: identifiers.delegationId,
      candidateId: identifiers.candidateId,
      targetId: null,
    },
    dispatch: {
      ...source.dispatch,
      requestId: identifiers.requestId,
      delegationId: identifiers.delegationId,
      candidateId: identifiers.candidateId,
      targetId: identifiers.targetId,
    },
  };
}

test("admission matrix is deterministic, immutable, and fail-closed", () => {
  const cases = [
    ["prepared", "admitted", "dispatch_prepared"],
    ["rejected", "rejected", "pipeline_rejected"],
    ["indeterminate", "indeterminate", "pipeline_indeterminate"],
  ] as const;
  for (const [dispatch, status, reason] of cases) {
    const source = summary(dispatch);
    const result = decideAutomationOrchestratorPipelineAdmission(
      source as never,
    );
    assert.equal(result.status, status);
    assert.equal(result.reason, reason);
    assert.equal(result.dispatchOccurred, false);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(
      result,
      decideAutomationOrchestratorPipelineAdmission(source as never),
    );
  }
  for (const invalid of [
    { ...summary(), valid: false },
    { ...summary(), progression: "unknown" },
    { ...summary(), candidateId: 1 },
    { ...summary(), dispatchOccurred: true },
    { ...summary(), dispatch: null },
  ]) {
    const result = decideAutomationOrchestratorPipelineAdmission(
      invalid as never,
    );
    assert.equal(result.status, "indeterminate");
    assert.equal(result.reason, "invalid_summary");
    assert.equal(result.requestId, null);
  }
});

test("admission covers every declared terminal stage outcome", () => {
  const cases = [
    [evaluationSummary("denied"), "rejected", "pipeline_rejected"],
    [
      evaluationSummary("indeterminate"),
      "indeterminate",
      "pipeline_indeterminate",
    ],
    [evaluationSummary("eligible"), "indeterminate", "invalid_summary"],
    [selectionSummary("rejected"), "rejected", "pipeline_rejected"],
    [
      selectionSummary("indeterminate"),
      "indeterminate",
      "pipeline_indeterminate",
    ],
    [selectionSummary("selected"), "indeterminate", "invalid_summary"],
    [summary("prepared"), "admitted", "dispatch_prepared"],
    [summary("rejected"), "rejected", "pipeline_rejected"],
    [summary("indeterminate"), "indeterminate", "pipeline_indeterminate"],
  ] as const;

  for (const [source, status, reason] of cases) {
    const result = decideAutomationOrchestratorPipelineAdmission(source);
    assert.equal(result.status, status);
    assert.equal(result.reason, reason);
  }
});

test("admission rejects contradictory summary structure and cross-stage statuses", () => {
  const evaluation = evaluationSummary();
  const selection = selectionSummary();
  const cases = [
    { ...summary(), valid: false },
    { ...summary(), status: "invalid", valid: true },
    { ...summary(), progression: "unknown" },
    { ...evaluation, evaluation: null },
    { ...selection, selection: null },
    { ...summary(), dispatch: null },
    { ...evaluation, selection: summary().selection },
    { ...evaluation, dispatch: summary().dispatch },
    { ...selection, dispatch: summary().dispatch },
    {
      ...evaluation,
      evaluation: { ...evaluation.evaluation, status: "selected" },
    },
    { ...selection, selection: { ...selection.selection, status: "eligible" } },
    { ...summary(), dispatch: { ...summary().dispatch, status: "selected" } },
  ];

  for (const source of cases) {
    const result = decideAutomationOrchestratorPipelineAdmission(
      source as never,
    );
    assert.equal(result.status, "indeterminate");
    assert.equal(result.reason, "invalid_summary");
  }
});

test("admission requires a complete validation subject", () => {
  for (const validationSubjectStatus of [
    null,
    "incomplete",
    "unknown",
  ] as const) {
    const result = decideAutomationOrchestratorPipelineAdmission({
      ...summary(),
      validationSubjectStatus,
    } as never);

    assert.equal(result.status, "indeterminate");
    assert.equal(result.admitted, false);
    assert.equal(result.reason, "invalid_summary");
    assert.deepEqual(
      {
        requestId: result.requestId,
        delegationId: result.delegationId,
        candidateId: result.candidateId,
        targetId: result.targetId,
      },
      {
        requestId: null,
        delegationId: null,
        candidateId: null,
        targetId: null,
      },
    );
  }
});

test("admission preserves exact identifiers and rejects inconsistent identifiers", () => {
  const source = summary();
  const mismatches = [
    { ...source, evaluation: { ...source.evaluation, requestId: "other" } },
    { ...source, evaluation: { ...source.evaluation, delegationId: "other" } },
    { ...source, selection: { ...source.selection, candidateId: "other" } },
    { ...source, dispatch: { ...source.dispatch, targetId: "other" } },
    { ...source, candidateId: 1 },
    { ...source, targetId: 1 },
    {
      ...evaluationSummary(),
      candidateId: "candidate",
      evaluation: {
        ...evaluationSummary().evaluation,
        candidateId: "candidate",
      },
    },
    {
      ...selectionSummary(),
      targetId: "target",
      selection: { ...selectionSummary().selection, targetId: "target" },
    },
  ];

  for (const invalid of mismatches) {
    assert.equal(
      decideAutomationOrchestratorPipelineAdmission(invalid as never).reason,
      "invalid_summary",
    );
  }

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
    const admitted = decideAutomationOrchestratorPipelineAdmission(
      withIdentifiers(summary(), identifiers),
    );
    assert.equal(admitted.status, "admitted");
    assert.equal(admitted.requestId, identifiers.requestId);
    assert.equal(admitted.delegationId, identifiers.delegationId);
    assert.equal(admitted.candidateId, identifiers.candidateId);
    assert.equal(admitted.targetId, identifiers.targetId);
  }
});

test("admission preserves non-operational flags, immutability, and input determinism", () => {
  const source = summary();
  const before = structuredClone(source);

  for (const flag of [
    "dispatchOccurred",
    "delegationOccurred",
    "providerInvoked",
    "forgeInvoked",
    "executionStarted",
  ] as const) {
    assert.equal(
      decideAutomationOrchestratorPipelineAdmission({
        ...source,
        [flag]: true,
      } as never).reason,
      "invalid_summary",
    );
  }

  const first = decideAutomationOrchestratorPipelineAdmission(source);
  const second = decideAutomationOrchestratorPipelineAdmission(source);
  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(
    {
      dispatchOccurred: first.dispatchOccurred,
      delegationOccurred: first.delegationOccurred,
      providerInvoked: first.providerInvoked,
      forgeInvoked: first.forgeInvoked,
      executionStarted: first.executionStarted,
    },
    {
      dispatchOccurred: false,
      delegationOccurred: false,
      providerInvoked: false,
      forgeInvoked: false,
      executionStarted: false,
    },
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAutomationOrchestratorPipeline,
  summarizeAutomationOrchestratorPipeline,
  validateAutomationOrchestratorPipeline,
} from "../../src/automation/orchestrator/index.js";

const metadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  labels: Object.freeze([]),
  attributes: Object.freeze({}),
});

function evidence(kinds: readonly string[]) {
  return kinds.map((kind) => ({
    evidenceId: kind,
    kind,
    reference: kind,
    metadata,
  }));
}

function input() {
  const evaluationEvidence = evidence([
    "declared_delegation",
    "orchestrator_evaluation",
    "orchestrator_plan",
    "policy_decision",
  ]);
  const selectionEvidence = evidence([
    "declared_delegation",
    "delegation_evaluation",
    "orchestrator_evaluation",
    "orchestrator_plan",
    "policy_decision",
  ]);
  const dispatchEvidence = evidence([
    "declared_delegation",
    "delegation_evaluation",
    "delegation_selection",
    "orchestrator_evaluation",
    "orchestrator_plan",
    "policy_decision",
  ]);
  const declaredDelegation = {
    delegationId: "delegation-1",
    input: {
      delegationId: "delegation-1",
      request: { requestId: "request-1" },
      target: { kind: "provider", providerId: "provider-1", forgeId: null },
    },
    status: "delegated",
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
    metadata,
  };
  const candidate = {
    candidateId: "candidate-1",
    declaredDelegation,
    evidence: selectionEvidence,
    metadata,
  };
  return {
    delegationEvaluation: {
      evaluationId: "evaluation-1",
      request: { requestId: "request-1" },
      context: {
        declaredDelegation,
        policyDecision: {
          status: "allowed",
          policyId: "policy-1",
          capability: "review",
          reason: "allowed",
          metadata,
        },
        orchestratorEvaluationResult: { status: "evaluated" },
        planResult: { status: "planned" },
      },
      evidence: evaluationEvidence,
      metadata,
    },
    delegationSelection: {
      selectionId: "selection-1",
      request: { requestId: "request-1" },
      context: {},
      candidates: [candidate],
      evidence: selectionEvidence,
      metadata,
    },
    delegationDispatch: {
      dispatchId: "dispatch-1",
      request: { requestId: "request-1" },
      context: {},
      target: {
        targetId: "target-1",
        selectedCandidate: candidate,
        declaredDelegation,
        evidence: dispatchEvidence,
        metadata,
      },
      evidence: dispatchEvidence,
      metadata,
    },
  } as never;
}

function valid() {
  const pipeline = evaluateAutomationOrchestratorPipeline(input());
  return {
    pipeline,
    validation: validateAutomationOrchestratorPipeline(pipeline),
  };
}

test("projects a valid dispatch pipeline without raw nested results", () => {
  const { pipeline, validation } = valid();
  const summary = summarizeAutomationOrchestratorPipeline(pipeline, validation);

  assert.deepEqual(
    summary,
    summarizeAutomationOrchestratorPipeline(pipeline, validation),
  );
  assert.equal(summary.status, "valid");
  assert.equal(summary.progression, "dispatch");
  assert.equal(summary.evaluation?.status, "eligible");
  assert.equal(summary.selection?.status, "selected");
  assert.equal(summary.dispatch?.status, "prepared");
  assert.equal(summary.requestId, "request-1");
  assert.equal(summary.delegationId, "delegation-1");
  assert.equal(summary.candidateId, "candidate-1");
  assert.equal(summary.targetId, "target-1");
  assert.equal(summary.dispatchOccurred, false);
  assert.equal(summary.delegationOccurred, false);
  assert.equal("evidence" in summary, false);
  assert.equal("delegationEvaluation" in summary, false);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.counts), true);
});

test("preserves valid evaluation and selection progression as explicit null stages", () => {
  const denied = input();
  denied.delegationEvaluation.context.policyDecision = {
    status: "denied",
    policyId: "policy-1",
    capability: "review",
    reason: "denied",
    metadata,
  };
  const evaluation = evaluateAutomationOrchestratorPipeline(denied);
  const evaluationSummary = summarizeAutomationOrchestratorPipeline(
    evaluation,
    validateAutomationOrchestratorPipeline(evaluation),
  );
  assert.equal(evaluationSummary.status, "valid");
  assert.equal(evaluationSummary.progression, "evaluation");
  assert.equal(evaluationSummary.selection, null);
  assert.equal(evaluationSummary.dispatch, null);

  const selectionInput = input();
  selectionInput.delegationSelection.candidates = [];
  const selection = evaluateAutomationOrchestratorPipeline(selectionInput);
  const selectionSummary = summarizeAutomationOrchestratorPipeline(
    selection,
    validateAutomationOrchestratorPipeline(selection),
  );
  assert.equal(selectionSummary.status, "valid");
  assert.equal(selectionSummary.progression, "selection");
  assert.equal(selectionSummary.selection?.status, "indeterminate");
  assert.equal(selectionSummary.dispatch, null);
});

test("fails closed for validation contradictions, cross-pipeline subjects, malformed stages, and operational flags", () => {
  const { pipeline, validation } = valid();
  const invalids = [
    [
      "validation invalid",
      pipeline,
      { ...validation, status: "invalid", valid: false },
    ],
    [
      "validation contradiction false",
      pipeline,
      { ...validation, status: "valid", valid: false },
    ],
    [
      "validation contradiction true",
      pipeline,
      { ...validation, status: "invalid", valid: true },
    ],
    [
      "incomplete subject",
      pipeline,
      {
        ...validation,
        subject: { ...validation.subject, status: "incomplete" },
      },
    ],
    ...["requestId", "delegationId", "candidateId", "targetId"].map((key) => [
      `mismatched ${key}`,
      pipeline,
      {
        ...validation,
        subject: { ...validation.subject, [key]: `other-${key}` },
      },
    ]),
    [
      "unknown progression",
      { ...pipeline, progression: "unknown" },
      validation,
    ],
    ["missing dispatch", { ...pipeline, delegationDispatch: null }, validation],
    [
      "missing selection",
      { ...pipeline, delegationSelection: null },
      validation,
    ],
    ["later dispatch", { ...pipeline, progression: "selection" }, validation],
    [
      "operational flag",
      {
        ...pipeline,
        delegationDispatch: {
          ...pipeline.delegationDispatch!,
          decision: {
            ...pipeline.delegationDispatch!.decision,
            executionStarted: true,
          },
        },
      },
      validation,
    ],
  ] as const;
  for (const [name, casePipeline, caseValidation] of invalids) {
    const summary = summarizeAutomationOrchestratorPipeline(
      casePipeline as never,
      caseValidation as never,
    );
    assert.equal(summary.status, "invalid", name);
    assert.equal(summary.valid, false);
    assert.equal(summary.progression, null);
  }
});

test("rejects statuses belonging to another declarative stage family", () => {
  const { pipeline, validation } = valid();
  const selection = pipeline.delegationSelection!;
  const dispatch = pipeline.delegationDispatch!;
  const cases = [
    {
      stage: "evaluation",
      status: "selected",
      value: {
        ...pipeline,
        delegationEvaluation: {
          ...pipeline.delegationEvaluation,
          status: "selected",
        },
      },
    },
    {
      stage: "evaluation",
      status: "prepared",
      value: {
        ...pipeline,
        delegationEvaluation: {
          ...pipeline.delegationEvaluation,
          decision: {
            ...pipeline.delegationEvaluation.decision,
            status: "prepared",
          },
        },
      },
    },
    {
      stage: "selection",
      status: "eligible",
      value: {
        ...pipeline,
        delegationSelection: { ...selection, status: "eligible" },
      },
    },
    {
      stage: "selection",
      status: "prepared",
      value: {
        ...pipeline,
        delegationSelection: {
          ...selection,
          decision: { ...selection.decision, status: "prepared" },
        },
      },
    },
    {
      stage: "dispatch",
      status: "eligible",
      value: {
        ...pipeline,
        delegationDispatch: { ...dispatch, status: "eligible" },
      },
    },
    {
      stage: "dispatch",
      status: "selected",
      value: {
        ...pipeline,
        delegationDispatch: {
          ...dispatch,
          dispatch: { ...dispatch.dispatch!, status: "selected" },
        },
      },
    },
  ];
  for (const item of cases) {
    const summary = summarizeAutomationOrchestratorPipeline(
      item.value as never,
      validation,
    );
    assert.equal(summary.status, "invalid", `${item.stage}:${item.status}`);
    assert.equal(summary.valid, false);
    assert.equal(summary.progression, null);
  }
});

test("does not mutate pipeline or validation inputs", () => {
  const { pipeline, validation } = valid();
  const pipelineBefore = JSON.stringify(pipeline);
  const validationBefore = JSON.stringify(validation);
  summarizeAutomationOrchestratorPipeline(pipeline, validation);
  assert.equal(JSON.stringify(pipeline), pipelineBefore);
  assert.equal(JSON.stringify(validation), validationBefore);
});

test("accepts empty plain-string identifiers when the public subject matches", () => {
  const { pipeline, validation } = valid();
  const empty = {
    ...pipeline,
    delegationEvaluation: {
      ...pipeline.delegationEvaluation,
      evaluation: {
        ...pipeline.delegationEvaluation.evaluation!,
        input: {
          ...pipeline.delegationEvaluation.evaluation!.input,
          request: {
            ...pipeline.delegationEvaluation.evaluation!.input.request,
            requestId: "",
          },
        },
      },
      decision: {
        ...pipeline.delegationEvaluation.decision,
        declaredDelegation: {
          ...pipeline.delegationEvaluation.decision.declaredDelegation!,
          delegationId: "",
        },
      },
    },
    delegationSelection: {
      ...pipeline.delegationSelection!,
      decision: {
        ...pipeline.delegationSelection!.decision,
        candidate: {
          ...pipeline.delegationSelection!.decision.candidate!,
          candidateId: "",
        },
      },
    },
    delegationDispatch: {
      ...pipeline.delegationDispatch!,
      decision: {
        ...pipeline.delegationDispatch!.decision,
        target: {
          ...pipeline.delegationDispatch!.decision.target!,
          targetId: "",
        },
      },
    },
  } as never;
  const matching = {
    ...validation,
    subject: {
      ...validation.subject,
      requestId: "",
      delegationId: "",
      candidateId: "",
      targetId: "",
    },
  } as never;
  const summary = summarizeAutomationOrchestratorPipeline(empty, matching);
  assert.equal(summary.status, "valid");
  assert.equal(summary.requestId, "");
  assert.equal(summary.delegationId, "");
  assert.equal(summary.candidateId, "");
  assert.equal(summary.targetId, "");
});

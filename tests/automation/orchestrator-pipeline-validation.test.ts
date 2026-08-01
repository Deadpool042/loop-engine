import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAutomationOrchestratorPipeline,
  validateAutomationOrchestratorPipeline,
} from "../../src/automation/orchestrator/index.js";
import type {
  AutomationOrchestratorPipelineResult,
  AutomationOrchestratorPipelineValidationResult,
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

function result() {
  return evaluateAutomationOrchestratorPipeline(input());
}

test("accepts valid evaluation, selection, and dispatch progression", () => {
  const dispatch = result();
  const deniedInput = input();
  deniedInput.delegationEvaluation.context.policyDecision = {
    status: "denied",
    policyId: "policy-1",
    capability: "review",
    reason: "denied",
    metadata,
  };
  const evaluation = evaluateAutomationOrchestratorPipeline(deniedInput);
  const selectionInput = input();
  selectionInput.delegationSelection.candidates = [];
  const selection = evaluateAutomationOrchestratorPipeline(selectionInput);
  const rejectedDispatch = {
    ...dispatch,
    delegationDispatch: {
      ...dispatch.delegationDispatch!,
      status: "rejected",
      dispatch: {
        ...dispatch.delegationDispatch!.dispatch!,
        status: "rejected",
        target: null,
      },
      decision: {
        ...dispatch.delegationDispatch!.decision,
        status: "rejected",
        target: null,
      },
    },
  };

  for (const value of [evaluation, selection, dispatch, rejectedDispatch]) {
    const validation = validateAutomationOrchestratorPipeline(value);
    assert.equal(validation.status, "valid");
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.diagnostics, []);
    assert.equal(validation.subject.status, "complete");
  }
});

test("is deterministic, immutable, and preserves its input", () => {
  const value: AutomationOrchestratorPipelineResult = result();
  const before = JSON.stringify(value);
  const evaluation = value.delegationEvaluation;
  const selection = value.delegationSelection;
  const dispatch = value.delegationDispatch;
  const first: AutomationOrchestratorPipelineValidationResult =
    validateAutomationOrchestratorPipeline(value);

  assert.deepEqual(first, validateAutomationOrchestratorPipeline(value));
  assert.equal(JSON.stringify(value), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.valid, true);
  assert.equal(first.status, "valid");
  assert.equal(first.subject.status, "complete");
  assert.equal(Object.isFrozen(first.subject), true);
  assert.equal(value.delegationEvaluation, evaluation);
  assert.equal(value.delegationSelection, selection);
  assert.equal(value.delegationDispatch, dispatch);
});

test("binds validation deterministically to stable public pipeline identities", () => {
  const original = result();
  const originalSubject =
    validateAutomationOrchestratorPipeline(original).subject;
  const otherRequest = {
    ...original,
    delegationEvaluation: {
      ...original.delegationEvaluation,
      evaluation: {
        ...original.delegationEvaluation.evaluation!,
        input: {
          ...original.delegationEvaluation.evaluation!.input,
          request: {
            ...original.delegationEvaluation.evaluation!.input.request,
            requestId: "other-request",
          },
        },
      },
    },
  } as never;
  const otherDelegation = {
    ...original,
    delegationEvaluation: {
      ...original.delegationEvaluation,
      decision: {
        ...original.delegationEvaluation.decision,
        declaredDelegation: {
          ...original.delegationEvaluation.decision.declaredDelegation!,
          delegationId: "other-delegation",
        },
      },
    },
  } as never;
  const otherCandidate = {
    ...original,
    delegationSelection: {
      ...original.delegationSelection!,
      decision: {
        ...original.delegationSelection!.decision,
        candidate: {
          ...original.delegationSelection!.decision.candidate!,
          candidateId: "other-candidate",
        },
      },
    },
  } as never;
  const otherTarget = {
    ...original,
    delegationDispatch: {
      ...original.delegationDispatch!,
      decision: {
        ...original.delegationDispatch!.decision,
        target: {
          ...original.delegationDispatch!.decision.target!,
          targetId: "other-target",
        },
      },
    },
  } as never;

  assert.deepEqual(
    originalSubject,
    validateAutomationOrchestratorPipeline(result()).subject,
  );
  assert.notDeepEqual(
    originalSubject,
    validateAutomationOrchestratorPipeline(otherRequest).subject,
  );
  assert.notDeepEqual(
    originalSubject,
    validateAutomationOrchestratorPipeline(otherDelegation).subject,
  );
  assert.notDeepEqual(
    originalSubject,
    validateAutomationOrchestratorPipeline(otherCandidate).subject,
  );
  assert.notDeepEqual(
    originalSubject,
    validateAutomationOrchestratorPipeline(otherTarget).subject,
  );

  const malformed = validateAutomationOrchestratorPipeline(null as never);
  assert.equal(malformed.status, "invalid");
  assert.equal(malformed.subject.status, "incomplete");
  assert.notDeepEqual(malformed.subject, originalSubject);
});

test("rejects invalid progression, nullability, status, identity, and operational flags", () => {
  const value = result();
  const selection = value.delegationSelection as NonNullable<
    typeof value.delegationSelection
  >;
  const dispatch = value.delegationDispatch as NonNullable<
    typeof value.delegationDispatch
  >;
  const invalid = [
    { ...value, progression: "evaluation", delegationSelection: selection },
    { ...value, progression: "evaluation", delegationDispatch: dispatch },
    { ...value, progression: "evaluation" },
    { ...value, progression: "selection", delegationSelection: null },
    { ...value, progression: "selection" },
    { ...value, progression: "selection", delegationDispatch: dispatch },
    {
      ...value,
      delegationEvaluation: { ...value.delegationEvaluation, status: "denied" },
    },
    {
      ...value,
      delegationSelection: { ...selection, status: "rejected" },
    },
    { ...value, delegationDispatch: null },
    {
      ...value,
      delegationSelection: {
        ...selection,
        decision: {
          ...selection.decision,
          candidate: {
            ...selection.decision.candidate!,
            declaredDelegation: {
              ...selection.decision.candidate!.declaredDelegation,
              delegationId: "other-delegation",
            },
          },
        },
      },
    },
    {
      ...value,
      delegationDispatch: {
        ...dispatch,
        decision: {
          ...dispatch.decision,
          target: {
            ...dispatch.decision.target!,
            selectedCandidate: {
              ...dispatch.decision.target!.selectedCandidate,
              candidateId: "other-candidate",
            },
          },
        },
      },
    },
    {
      ...value,
      delegationDispatch: {
        ...dispatch,
        decision: { ...dispatch.decision, executionStarted: true },
      },
    },
    { ...value, progression: "unknown" },
    null,
  ];

  for (const candidate of invalid) {
    assert.equal(
      validateAutomationOrchestratorPipeline(candidate as never).valid,
      false,
    );
  }
});

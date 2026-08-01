import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateAutomationOrchestratorPipeline } from "../../src/automation/orchestrator/index.js";
import type { AutomationOrchestratorPipelineResult } from "../../src/automation/orchestrator/index.js";

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

test("composes eligible evaluation, selected candidate, and prepared dispatch", () => {
  const result: AutomationOrchestratorPipelineResult =
    evaluateAutomationOrchestratorPipeline(input());
  assert.equal(result.progression, "dispatch");
  assert.equal(result.delegationEvaluation.status, "eligible");
  assert.equal(result.delegationSelection?.status, "selected");
  assert.equal(result.delegationDispatch?.status, "prepared");
  assert.equal(result.delegationDispatch?.decision.dispatchOccurred, false);
  assert.equal(result.delegationDispatch?.decision.executionStarted, false);
  assert.equal(Object.isFrozen(result), true);
});

test("is deterministic and does not mutate input", () => {
  const value = input();
  const before = JSON.stringify(value);
  const first = evaluateAutomationOrchestratorPipeline(value);
  assert.deepEqual(first, evaluateAutomationOrchestratorPipeline(value));
  assert.equal(JSON.stringify(value), before);
});

test("short-circuits non-eligible evaluation and non-selected selection", () => {
  const denied = input();
  denied.delegationEvaluation.context.policyDecision = {
    status: "denied",
    policyId: "policy-1",
    capability: "review",
    reason: "denied",
    metadata,
  };
  const evaluationStopped = evaluateAutomationOrchestratorPipeline(denied);
  assert.equal(evaluationStopped.progression, "evaluation");
  assert.equal(evaluationStopped.delegationSelection, null);
  assert.equal(evaluationStopped.delegationDispatch, null);

  const missingCandidates = input();
  missingCandidates.delegationSelection.candidates = [];
  const selectionStopped =
    evaluateAutomationOrchestratorPipeline(missingCandidates);
  assert.equal(selectionStopped.progression, "selection");
  assert.equal(selectionStopped.delegationDispatch, null);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAutomationOrchestratorDelegationSelection,
  type AutomationOrchestratorDelegationSelectionInput,
  type AutomationOrchestratorDelegationSelector,
} from "../../src/automation/orchestrator/delegation-selection/index.js";

const metadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-07-31T00:00:00.000Z",
  labels: Object.freeze(["automation"]),
  attributes: Object.freeze({ scope: "test" }),
});

function evidence() {
  return [
    "declared_delegation",
    "delegation_evaluation",
    "orchestrator_evaluation",
    "orchestrator_plan",
    "policy_decision",
  ].map((kind) => ({
    evidenceId: `evidence-${kind}`,
    kind,
    reference: kind,
    metadata,
  }));
}

function candidate(candidateId: string, targetId = "provider-1") {
  return {
    candidateId,
    declaredDelegation: {
      delegationId: "delegation-1",
      input: {
        delegationId: "delegation-1",
        request: { requestId: "request-1" },
        target: { kind: "provider", providerId: targetId, forgeId: null },
      },
      status: "delegated",
      delegationOccurred: false,
      providerInvoked: false,
      forgeInvoked: false,
      executionStarted: false,
      metadata,
    },
    evidence: evidence(),
    metadata,
  };
}

function input(): AutomationOrchestratorDelegationSelectionInput {
  return {
    selectionId: "selection-1",
    request: { requestId: "request-1" },
    context: {
      delegationEvaluationResult: {
        status: "eligible",
        decision: {
          status: "eligible",
          declaredDelegation: candidate("evaluation").declaredDelegation,
          policyDecision: { status: "allowed" },
        },
      },
    },
    candidates: [candidate("candidate-1")],
    evidence: evidence(),
    metadata,
  } as AutomationOrchestratorDelegationSelectionInput;
}

test("selects one eligible declarative candidate without crossing a boundary", () => {
  const selector: AutomationOrchestratorDelegationSelector = {
    select: evaluateAutomationOrchestratorDelegationSelection,
  };
  const result = selector.select(input());

  assert.equal(result.status, "selected");
  assert.equal(result.decision.status, "selected");
  assert.equal(result.decision.candidate.candidateId, "candidate-1");
  assert.equal(result.decision.delegationOccurred, false);
  assert.equal(result.decision.providerInvoked, false);
  assert.equal(result.decision.forgeInvoked, false);
  assert.equal(result.decision.executionStarted, false);
  assert.equal("dispatch" in result, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decision), true);
});

test("orders valid candidates by candidate id and keeps inputs unchanged", () => {
  const original = input();
  const value = {
    ...original,
    candidates: [
      candidate("candidate-z", "provider-z"),
      candidate("candidate-a"),
    ],
  } as AutomationOrchestratorDelegationSelectionInput;
  const before = JSON.stringify(value);
  const first = evaluateAutomationOrchestratorDelegationSelection(value);
  const second = evaluateAutomationOrchestratorDelegationSelection(value);

  assert.equal(first.status, "selected");
  assert.equal(first.decision.candidate.candidateId, "candidate-a");
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(value), before);
  assert.equal(Object.isFrozen(first.selection?.candidates), true);
});

test("rejects denied evaluation and remains indeterminate for incomplete evaluation or candidates", () => {
  const eligible = input();
  const denied = {
    ...eligible,
    context: {
      ...eligible.context,
      delegationEvaluationResult: {
        ...eligible.context.delegationEvaluationResult,
        status: "denied",
        decision: { status: "denied" },
      },
    },
  } as AutomationOrchestratorDelegationSelectionInput;
  const indeterminate = {
    ...input(),
    context: { delegationEvaluationResult: { status: "indeterminate" } },
  } as AutomationOrchestratorDelegationSelectionInput;
  const empty = {
    ...input(),
    candidates: [],
  } as AutomationOrchestratorDelegationSelectionInput;
  const malformed = {
    ...input(),
    candidates: [{ ...candidate("candidate-1"), metadata: null }],
  } as AutomationOrchestratorDelegationSelectionInput;

  assert.equal(
    evaluateAutomationOrchestratorDelegationSelection(denied).status,
    "rejected",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegationSelection(indeterminate).status,
    "indeterminate",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegationSelection(empty).status,
    "indeterminate",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegationSelection(malformed).status,
    "indeterminate",
  );
});

test("fails closed for unsupported, duplicate, and malformed candidate input", () => {
  const unsupported = {
    ...input(),
    candidates: [
      {
        ...candidate("candidate-1"),
        declaredDelegation: {
          ...candidate("candidate-1").declaredDelegation,
          status: "rejected",
        },
      },
    ],
  } as AutomationOrchestratorDelegationSelectionInput;
  const duplicate = {
    ...input(),
    candidates: [candidate("candidate-1"), candidate("candidate-1")],
  } as AutomationOrchestratorDelegationSelectionInput;

  const rejected =
    evaluateAutomationOrchestratorDelegationSelection(unsupported);
  const selected = evaluateAutomationOrchestratorDelegationSelection(duplicate);
  assert.equal(rejected.status, "indeterminate");
  assert.equal(selected.status, "selected");
  assert.equal(selected.selection?.candidates.length, 1);
  assert.equal(
    evaluateAutomationOrchestratorDelegationSelection(null as never).status,
    "indeterminate",
  );
});

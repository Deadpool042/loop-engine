import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAutomationOrchestratorDelegation,
  type AutomationOrchestratorDelegationEvaluator,
  type AutomationOrchestratorDelegationEvaluationInput,
} from "../../src/automation/orchestrator/delegation-evaluation/index.js";

const metadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-07-31T00:00:00.000Z",
  labels: Object.freeze(["automation"]),
  attributes: Object.freeze({ scope: "test" }),
});

const policyMetadata = Object.freeze({
  schemaVersion: 1 as const,
  policyId: "policy-1",
  labels: Object.freeze([]),
  attributes: Object.freeze({}),
});

function input(): AutomationOrchestratorDelegationEvaluationInput {
  return {
    evaluationId: "delegation-evaluation-1",
    request: {
      requestId: "request-1",
    },
    context: {
      orchestratorContext: {},
      orchestratorEvaluationResult: { status: "evaluated" },
      planResult: { status: "planned" },
      declaredDelegation: {
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
      },
      policyDecision: {
        status: "allowed",
        policyId: "policy-1",
        capability: "review",
        reason: "allowed",
        metadata: policyMetadata,
      },
    },
    evidence: [
      {
        evidenceId: "evidence-delegation",
        kind: "declared_delegation",
        reference: "delegation-1",
        metadata,
      },
      {
        evidenceId: "evidence-evaluation",
        kind: "orchestrator_evaluation",
        reference: "evaluation-1",
        metadata,
      },
      {
        evidenceId: "evidence-plan",
        kind: "orchestrator_plan",
        reference: "plan-1",
        metadata,
      },
      {
        evidenceId: "evidence-policy",
        kind: "policy_decision",
        reference: "policy-1",
        metadata,
      },
    ],
    metadata,
  } as AutomationOrchestratorDelegationEvaluationInput;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

test("evaluates complete allowed evidence as eligible without crossing a boundary", () => {
  const evaluator: AutomationOrchestratorDelegationEvaluator = {
    evaluate: evaluateAutomationOrchestratorDelegation,
  };
  const result = evaluator.evaluate(input());

  assert.equal(result.status, "eligible");
  assert.equal(result.decision.status, "eligible");
  assert.equal(result.decision.delegationOccurred, false);
  assert.equal(result.decision.providerInvoked, false);
  assert.equal(result.decision.forgeInvoked, false);
  assert.equal(result.decision.executionStarted, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decision), true);
  assert.equal("candidate" in result, false);
  assert.equal("dispatch" in result, false);
});

test("is deterministic, deduplicates evidence, and does not mutate input", () => {
  const initial = input();
  const value = {
    ...initial,
    evidence: [...initial.evidence, initial.evidence[0]!],
  } as AutomationOrchestratorDelegationEvaluationInput;
  const before = json(value);
  const first = evaluateAutomationOrchestratorDelegation(value);
  const second = evaluateAutomationOrchestratorDelegation(value);

  assert.deepEqual(first, second);
  assert.equal(json(value), before);
  assert.equal(first.decision.evidence.length, 4);
});

test("fails closed for missing or incomplete evidence", () => {
  const missing = {
    ...input(),
    evidence: [],
  } as AutomationOrchestratorDelegationEvaluationInput;
  const complete = input();
  const incomplete = {
    ...complete,
    evidence: complete.evidence.slice(0, 3),
  } as AutomationOrchestratorDelegationEvaluationInput;

  for (const value of [missing, incomplete]) {
    const result = evaluateAutomationOrchestratorDelegation(value);
    assert.equal(result.status, "indeterminate");
    assert.equal(result.decision.status, "indeterminate");
    assert.equal(result.failure.code, "evidence_missing");
    assert.equal(result.decision.delegationOccurred, false);
  }
});

test("denies explicit policy denial and fails closed for inconsistent inputs", () => {
  const allowed = input();
  const denied = {
    ...allowed,
    context: {
      ...allowed.context,
      policyDecision: {
        ...allowed.context.policyDecision!,
        status: "denied",
      },
    },
  } as AutomationOrchestratorDelegationEvaluationInput;
  const inconsistentIdentity = {
    ...input(),
    request: { requestId: "another-request" },
  } as AutomationOrchestratorDelegationEvaluationInput;
  const targeted = input();
  const invalidTarget = {
    ...targeted,
    context: {
      ...targeted.context,
      declaredDelegation: {
        ...targeted.context.declaredDelegation!,
        input: {
          ...targeted.context.declaredDelegation!.input,
          target: { kind: "provider", providerId: "", forgeId: null },
        },
      },
    },
  } as AutomationOrchestratorDelegationEvaluationInput;
  const unknown = input();
  const unknownDecision = {
    ...unknown,
    context: { ...unknown.context, policyDecision: { status: "unknown" } },
  } as AutomationOrchestratorDelegationEvaluationInput;

  assert.equal(
    evaluateAutomationOrchestratorDelegation(denied).status,
    "denied",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegation(inconsistentIdentity).status,
    "indeterminate",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegation(invalidTarget).status,
    "indeterminate",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegation(unknownDecision).status,
    "indeterminate",
  );
  assert.equal(
    evaluateAutomationOrchestratorDelegation(null as never).status,
    "indeterminate",
  );
});

test("orders findings and failures deterministically", () => {
  const malformed = { ...input(), context: null } as never;
  const result = evaluateAutomationOrchestratorDelegation(malformed);

  assert.equal(result.status, "indeterminate");
  assert.deepEqual(
    result.evaluation?.findings.map((finding) => finding.code),
    [
      "context_invalid",
      "declared_delegation_invalid",
      "eligibility_indeterminate",
    ],
  );
  assert.equal(result.failure.code, "declared_delegation_invalid");
});

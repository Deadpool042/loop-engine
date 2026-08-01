import assert from "node:assert/strict";
import { test } from "node:test";

import {
  prepareAutomationOrchestratorDelegationDispatch,
  type AutomationOrchestratorDelegationDispatcher,
  type AutomationOrchestratorDelegationDispatchInput,
} from "../../src/automation/orchestrator/delegation-dispatch/index.js";

const metadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  labels: Object.freeze([]),
  attributes: Object.freeze({}),
});

function evidence() {
  return [
    "declared_delegation",
    "delegation_evaluation",
    "delegation_selection",
    "orchestrator_evaluation",
    "orchestrator_plan",
    "policy_decision",
  ].map((kind) => ({ evidenceId: kind, kind, reference: kind, metadata }));
}

function input(): AutomationOrchestratorDelegationDispatchInput {
  const declaredDelegation = {
    delegationId: "delegation-1",
    input: {
      delegationId: "delegation-1",
      request: { requestId: "request-1" },
    },
    status: "delegated",
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  };
  const selectedCandidate = {
    candidateId: "candidate-1",
    declaredDelegation,
    evidence: evidence(),
    metadata,
  };
  return {
    dispatchId: "dispatch-1",
    request: { requestId: "request-1" },
    context: {
      selectionResult: {
        status: "selected",
        decision: { status: "selected", candidate: selectedCandidate },
      },
    },
    target: {
      targetId: "target-1",
      selectedCandidate,
      declaredDelegation,
      evidence: evidence(),
      metadata,
    },
    evidence: evidence(),
    metadata,
  } as AutomationOrchestratorDelegationDispatchInput;
}

test("prepares a selected candidate declaratively with all flags false", () => {
  const dispatcher: AutomationOrchestratorDelegationDispatcher = {
    prepare: prepareAutomationOrchestratorDelegationDispatch,
  };
  const result = dispatcher.prepare(input());
  assert.equal(result.status, "prepared");
  assert.equal(result.decision.dispatchOccurred, false);
  assert.equal(result.decision.delegationOccurred, false);
  assert.equal(result.decision.providerInvoked, false);
  assert.equal(result.decision.forgeInvoked, false);
  assert.equal(result.decision.executionStarted, false);
  assert.equal("transport" in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test("is deterministic, normalizes evidence, and keeps input unchanged", () => {
  const original = input();
  const value = {
    ...original,
    evidence: [...original.evidence, original.evidence[0]!].reverse(),
  } as AutomationOrchestratorDelegationDispatchInput;
  const before = JSON.stringify(value);
  const first = prepareAutomationOrchestratorDelegationDispatch(value);
  const second = prepareAutomationOrchestratorDelegationDispatch(value);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(value), before);
  assert.equal(first.decision.evidence.length, 6);
});

test("fails closed for rejected or incomplete selection, target, evidence, and input", () => {
  const rejected = {
    ...input(),
    context: {
      selectionResult: { status: "rejected", decision: { status: "rejected" } },
    },
  } as AutomationOrchestratorDelegationDispatchInput;
  const indeterminate = {
    ...input(),
    context: {
      selectionResult: {
        status: "indeterminate",
        decision: { status: "indeterminate" },
      },
    },
  } as AutomationOrchestratorDelegationDispatchInput;
  const missingEvidence = {
    ...input(),
    evidence: [],
  } as AutomationOrchestratorDelegationDispatchInput;
  const missingTarget = { ...input(), target: null } as never;
  const mismatched = {
    ...input(),
    target: { ...input().target, targetId: "" },
  } as AutomationOrchestratorDelegationDispatchInput;

  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(rejected).status,
    "rejected",
  );
  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(indeterminate).status,
    "indeterminate",
  );
  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(missingEvidence).status,
    "indeterminate",
  );
  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(missingTarget).status,
    "indeterminate",
  );
  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(mismatched).status,
    "indeterminate",
  );
  assert.equal(
    prepareAutomationOrchestratorDelegationDispatch(null as never).status,
    "indeterminate",
  );
});

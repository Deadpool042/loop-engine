/**
 * V19.5 public Automation Orchestrator Delegation Evaluation contracts.
 *
 * This package describes deterministic, fail-closed eligibility data only. It
 * supplies no evaluator implementation, delegation execution, provider or
 * forge invocation, selection algorithm, scheduler, retry, timer,
 * concurrency, callback, command, executable payload, runtime effect, or
 * dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorRequest,
} from "../index.js";
import type { AutomationOrchestratorDelegation } from "../delegation/index.js";
import type { AutomationOrchestratorEvaluationResult } from "../evaluation/index.js";
import type { AutomationOrchestratorPlanResult } from "../planning/index.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";

export type AutomationOrchestratorDelegationEvaluationStatus =
  "eligible" | "denied" | "indeterminate";

export type AutomationOrchestratorDelegationEvaluationEvidence = Readonly<{
  evidenceId: string;
  kind:
    | "declared_delegation"
    | "orchestrator_evaluation"
    | "orchestrator_plan"
    | "policy_decision";
  reference: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationEvaluationFinding = Readonly<{
  code:
    | "input_invalid"
    | "context_invalid"
    | "declared_delegation_invalid"
    | "orchestrator_evaluation_rejected"
    | "orchestrator_evaluation_failed"
    | "plan_rejected"
    | "plan_failed"
    | "policy_denied"
    | "evidence_missing"
    | "evidence_invalid"
    | "eligibility_indeterminate";
  message: string;
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationEvaluationContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  orchestratorEvaluationResult: AutomationOrchestratorEvaluationResult;
  planResult: AutomationOrchestratorPlanResult;
  declaredDelegation: AutomationOrchestratorDelegation;
  policyDecision: AutomationPolicyDecision | null;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationEvaluationInput = Readonly<{
  evaluationId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorDelegationEvaluationContext;
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
  metadata: AutomationMetadata;
}>;

/**
 * Eligibility is not execution: every branch preserves that the declared
 * delegation has not occurred and does not authorize a provider or forge call.
 */
export type AutomationOrchestratorDelegationEvaluationDecision =
  | Readonly<{
      status: "eligible";
      declaredDelegation: AutomationOrchestratorDelegation;
      policyDecision: AutomationPolicyDecision;
      evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "denied";
      declaredDelegation: AutomationOrchestratorDelegation;
      policyDecision: AutomationPolicyDecision | null;
      evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      declaredDelegation: AutomationOrchestratorDelegation | null;
      policyDecision: AutomationPolicyDecision | null;
      evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>;

export type AutomationOrchestratorDelegationEvaluationFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "declared_delegation_invalid"
    | "evaluation_rejected"
    | "evaluation_failed"
    | "plan_rejected"
    | "plan_failed"
    | "policy_denied"
    | "evidence_missing"
    | "evidence_invalid"
    | "decision_indeterminate";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationEvaluation = Readonly<{
  evaluationId: string;
  input: AutomationOrchestratorDelegationEvaluationInput;
  status: AutomationOrchestratorDelegationEvaluationStatus;
  findings: readonly AutomationOrchestratorDelegationEvaluationFinding[];
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationEvaluationResult =
  | Readonly<{
      status: "eligible" | "denied";
      evaluation: AutomationOrchestratorDelegationEvaluation;
      decision: AutomationOrchestratorDelegationEvaluationDecision;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      evaluation: AutomationOrchestratorDelegationEvaluation | null;
      decision: AutomationOrchestratorDelegationEvaluationDecision;
      failure: AutomationOrchestratorDelegationEvaluationFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic delegation eligibility evaluation. This
 * interface is declarative only; an implementation is responsible for any
 * evaluation behavior and still cannot perform delegation through this port.
 */
export interface AutomationOrchestratorDelegationEvaluator {
  evaluate(
    input: AutomationOrchestratorDelegationEvaluationInput,
  ): AutomationOrchestratorDelegationEvaluationResult;
}

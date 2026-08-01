/**
 * V19.2 public Automation Orchestrator Evaluation contracts.
 *
 * This package describes deterministic, fail-closed evaluation data only. It
 * supplies no evaluator implementation, orchestration algorithm, state
 * machine, retry, timer, concurrency, runtime effect, or dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorDecision,
  AutomationOrchestratorRequest,
} from "../index.js";
import type {
  AutomationPolicyDecision,
  AutomationPolicyResult,
} from "../../policy/index.js";

export type AutomationOrchestratorEvaluationStatus =
  "evaluated" | "rejected" | "failed";

export type AutomationOrchestratorEvaluationEvidence = Readonly<{
  evidenceId: string;
  kind: "orchestrator_request" | "policy_result" | "orchestrator_decision";
  reference: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluationFinding = Readonly<{
  code:
    | "input_invalid"
    | "context_invalid"
    | "policy_denied"
    | "policy_failed"
    | "selection_rejected"
    | "decision_invalid";
  message: string;
  evidence: readonly AutomationOrchestratorEvaluationEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluationContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  policyResult: AutomationPolicyResult;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluationInput = Readonly<{
  evaluationId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorEvaluationContext;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluationDecision =
  | Readonly<{
      status: "allowed";
      policyDecision: AutomationPolicyDecision;
      orchestratorDecision: AutomationOrchestratorDecision;
      evidence: readonly AutomationOrchestratorEvaluationEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected";
      policyDecision: AutomationPolicyDecision | null;
      orchestratorDecision: AutomationOrchestratorDecision | null;
      evidence: readonly AutomationOrchestratorEvaluationEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>;

export type AutomationOrchestratorEvaluationFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "policy_denied"
    | "policy_failed"
    | "decision_rejected"
    | "evidence_missing"
    | "evaluation_invalid";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluation = Readonly<{
  evaluationId: string;
  input: AutomationOrchestratorEvaluationInput;
  status: AutomationOrchestratorEvaluationStatus;
  findings: readonly AutomationOrchestratorEvaluationFinding[];
  evidence: readonly AutomationOrchestratorEvaluationEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorEvaluationResult =
  | Readonly<{
      status: "evaluated";
      evaluation: AutomationOrchestratorEvaluation;
      decision: AutomationOrchestratorEvaluationDecision;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      evaluation: AutomationOrchestratorEvaluation | null;
      decision: AutomationOrchestratorEvaluationDecision | null;
      failure: AutomationOrchestratorEvaluationFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic evaluation. This interface is declarative
 * only; an implementation is responsible for any evaluation behavior.
 */
export interface AutomationOrchestratorEvaluator {
  evaluate(
    input: AutomationOrchestratorEvaluationInput,
  ): AutomationOrchestratorEvaluationResult;
}

/**
 * V19.7 public Automation Orchestrator Delegation Dispatch contracts.
 *
 * This package describes deterministic, fail-closed dispatch preparation data
 * only. It supplies no dispatcher implementation, dispatch function, delivery
 * logic, provider or forge invocation, transport adaptation, serialization,
 * retry, timer, scheduling, concurrency, callback, command, executable
 * payload, runtime effect, or dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorRequest,
} from "../index.js";
import type { AutomationOrchestratorDelegation } from "../delegation/index.js";
import type { AutomationOrchestratorDelegationEvaluationResult } from "../delegation-evaluation/index.js";
import type {
  AutomationOrchestratorDelegationSelectionCandidate,
  AutomationOrchestratorDelegationSelectionResult,
} from "../delegation-selection/index.js";
import type { AutomationOrchestratorEvaluationResult } from "../evaluation/index.js";
import type { AutomationOrchestratorPlanResult } from "../planning/index.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";

export type AutomationOrchestratorDelegationDispatchStatus =
  "prepared" | "rejected" | "indeterminate";

export type AutomationOrchestratorDelegationDispatchEvidence = Readonly<{
  evidenceId: string;
  kind:
    | "declared_delegation"
    | "delegation_evaluation"
    | "delegation_selection"
    | "orchestrator_evaluation"
    | "orchestrator_plan"
    | "policy_decision";
  reference: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationDispatchTarget = Readonly<{
  targetId: string;
  selectedCandidate: AutomationOrchestratorDelegationSelectionCandidate;
  declaredDelegation: AutomationOrchestratorDelegation;
  evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationDispatchContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  orchestratorEvaluationResult: AutomationOrchestratorEvaluationResult;
  planResult: AutomationOrchestratorPlanResult;
  delegationEvaluationResult: AutomationOrchestratorDelegationEvaluationResult;
  selectionResult: AutomationOrchestratorDelegationSelectionResult;
  policyDecision: AutomationPolicyDecision | null;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationDispatchInput = Readonly<{
  dispatchId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorDelegationDispatchContext;
  target: AutomationOrchestratorDelegationDispatchTarget;
  evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
  metadata: AutomationMetadata;
}>;

/**
 * Preparation stays entirely inside the declarative boundary. It does not
 * assert availability, delivery, acceptance, delegation, or execution.
 */
export type AutomationOrchestratorDelegationDispatchDecision =
  | Readonly<{
      status: "prepared";
      target: AutomationOrchestratorDelegationDispatchTarget;
      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
      dispatchOccurred: false;
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected";
      target: AutomationOrchestratorDelegationDispatchTarget | null;
      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
      dispatchOccurred: false;
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      target: AutomationOrchestratorDelegationDispatchTarget | null;
      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
      dispatchOccurred: false;
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>;

export type AutomationOrchestratorDelegationDispatchFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "target_invalid"
    | "selection_rejected"
    | "selection_indeterminate"
    | "delegation_evaluation_denied"
    | "delegation_evaluation_indeterminate"
    | "policy_denied"
    | "evidence_missing"
    | "evidence_invalid"
    | "dispatch_indeterminate";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationDispatch = Readonly<{
  dispatchId: string;
  input: AutomationOrchestratorDelegationDispatchInput;
  status: AutomationOrchestratorDelegationDispatchStatus;
  target: AutomationOrchestratorDelegationDispatchTarget | null;
  evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationDispatchResult =
  | Readonly<{
      status: "prepared" | "rejected";
      dispatch: AutomationOrchestratorDelegationDispatch;
      decision: AutomationOrchestratorDelegationDispatchDecision;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      dispatch: AutomationOrchestratorDelegationDispatch | null;
      decision: AutomationOrchestratorDelegationDispatchDecision;
      failure: AutomationOrchestratorDelegationDispatchFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic dispatch preparation. This interface is
 * declarative only; an implementation cannot cross a provider, forge,
 * transport, or runtime boundary through this port.
 */
export interface AutomationOrchestratorDelegationDispatcher {
  prepare(
    input: AutomationOrchestratorDelegationDispatchInput,
  ): AutomationOrchestratorDelegationDispatchResult;
}

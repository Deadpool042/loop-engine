/**
 * V19.6 public Automation Orchestrator Delegation Selection contracts.
 *
 * This package describes deterministic, fail-closed selection data only. It
 * supplies no selector implementation, selection algorithm, scoring engine,
 * delegation, provider or forge invocation, scheduler, retry, timer,
 * concurrency, callback, command, runtime effect, or dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorRequest,
} from "../index.js";
import type { AutomationOrchestratorDelegation } from "../delegation/index.js";
import type { AutomationOrchestratorDelegationEvaluationResult } from "../delegation-evaluation/index.js";
import type { AutomationOrchestratorEvaluationResult } from "../evaluation/index.js";
import type { AutomationOrchestratorPlanResult } from "../planning/index.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";

export type AutomationOrchestratorDelegationSelectionStatus =
  "selected" | "rejected" | "indeterminate";

export type AutomationOrchestratorDelegationSelectionEvidence = Readonly<{
  evidenceId: string;
  kind:
    | "declared_delegation"
    | "delegation_evaluation"
    | "orchestrator_evaluation"
    | "orchestrator_plan"
    | "policy_decision";
  reference: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationSelectionCandidate = Readonly<{
  candidateId: string;
  declaredDelegation: AutomationOrchestratorDelegation;
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationSelectionContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  orchestratorEvaluationResult: AutomationOrchestratorEvaluationResult;
  planResult: AutomationOrchestratorPlanResult;
  delegationEvaluationResult: AutomationOrchestratorDelegationEvaluationResult;
  policyDecision: AutomationPolicyDecision | null;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationSelectionInput = Readonly<{
  selectionId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorDelegationSelectionContext;
  candidates: readonly AutomationOrchestratorDelegationSelectionCandidate[];
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
  metadata: AutomationMetadata;
}>;

/**
 * A selected candidate is descriptive only. No decision branch can report an
 * operational delegation, provider call, forge call, or started execution.
 */
export type AutomationOrchestratorDelegationSelectionDecision =
  | Readonly<{
      status: "selected";
      candidate: AutomationOrchestratorDelegationSelectionCandidate;
      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected";
      candidate: AutomationOrchestratorDelegationSelectionCandidate | null;
      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      candidate: AutomationOrchestratorDelegationSelectionCandidate | null;
      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationMetadata;
    }>;

export type AutomationOrchestratorDelegationSelectionFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "candidate_missing"
    | "candidate_invalid"
    | "delegation_evaluation_denied"
    | "delegation_evaluation_indeterminate"
    | "policy_denied"
    | "evidence_missing"
    | "evidence_invalid"
    | "selection_indeterminate";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationSelection = Readonly<{
  selectionId: string;
  input: AutomationOrchestratorDelegationSelectionInput;
  status: AutomationOrchestratorDelegationSelectionStatus;
  candidates: readonly AutomationOrchestratorDelegationSelectionCandidate[];
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationSelectionResult =
  | Readonly<{
      status: "selected" | "rejected";
      selection: AutomationOrchestratorDelegationSelection;
      decision: AutomationOrchestratorDelegationSelectionDecision;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "indeterminate";
      selection: AutomationOrchestratorDelegationSelection | null;
      decision: AutomationOrchestratorDelegationSelectionDecision;
      failure: AutomationOrchestratorDelegationSelectionFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic delegation selection. This interface is
 * declarative only; an implementation cannot invoke a provider, forge, or
 * delegation through this port.
 */
export interface AutomationOrchestratorDelegationSelector {
  select(
    input: AutomationOrchestratorDelegationSelectionInput,
  ): AutomationOrchestratorDelegationSelectionResult;
}

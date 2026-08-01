/**
 * V19.4 public Automation Orchestrator Delegation contracts.
 *
 * This package describes deterministic, fail-closed delegation data only. It
 * supplies no delegator implementation, provider or forge invocation,
 * scheduling algorithm, retry, timer, concurrency, runtime effect, or
 * dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorRequest,
} from "../index.js";
import type { AutomationOrchestratorEvaluationResult } from "../evaluation/index.js";
import type { AutomationOrchestratorPlanResult } from "../planning/index.js";
import type {
  AutomationForgeId,
  AutomationForgeResult,
} from "../../forge/index.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";
import type {
  AutomationProviderId,
  AutomationProviderResult,
} from "../../provider/index.js";

export type AutomationOrchestratorDelegationStatus =
  "delegated" | "rejected" | "failed";

export type AutomationOrchestratorDelegationTarget =
  | Readonly<{
      kind: "provider";
      providerId: AutomationProviderId;
      forgeId: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      kind: "forge";
      providerId: null;
      forgeId: AutomationForgeId;
      metadata: AutomationMetadata;
    }>;

export type AutomationOrchestratorDelegationContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  evaluationResult: AutomationOrchestratorEvaluationResult;
  planResult: AutomationOrchestratorPlanResult;
  policyDecision: AutomationPolicyDecision | null;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationInput = Readonly<{
  delegationId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorDelegationContext;
  target: AutomationOrchestratorDelegationTarget;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "evaluation_rejected"
    | "evaluation_failed"
    | "plan_rejected"
    | "plan_failed"
    | "policy_denied"
    | "target_rejected"
    | "result_invalid";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegation = Readonly<{
  delegationId: string;
  input: AutomationOrchestratorDelegationInput;
  status: AutomationOrchestratorDelegationStatus;
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorDelegationResult =
  | Readonly<{
      status: "delegated";
      delegation: AutomationOrchestratorDelegation;
      target: AutomationOrchestratorDelegationTarget;
      providerResult: AutomationProviderResult | null;
      forgeResult: AutomationForgeResult | null;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      delegation: AutomationOrchestratorDelegation | null;
      target: AutomationOrchestratorDelegationTarget | null;
      providerResult: AutomationProviderResult | null;
      forgeResult: AutomationForgeResult | null;
      failure: AutomationOrchestratorDelegationFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic delegation. This interface is declarative
 * only; an implementation is responsible for any external invocation.
 */
export interface AutomationOrchestratorDelegator {
  delegate(
    input: AutomationOrchestratorDelegationInput,
  ): AutomationOrchestratorDelegationResult;
}

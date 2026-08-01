/**
 * V19.1 public Automation Orchestrator contracts.
 *
 * This package declares deterministic orchestration relationships only. It
 * supplies no orchestration algorithm, state machine, retry, timer,
 * concurrency, runtime effect, or dependency discovery.
 */

import type {
  AutomationContext,
  AutomationMetadata,
  AutomationRequest,
  AutomationResult,
} from "../types.js";
import type { AutomationApplicationAssembly } from "../assembly/index.js";
import type {
  AutomationForgeId,
  AutomationForgeResult,
} from "../forge/index.js";
import type {
  AutomationPolicyDecision,
  AutomationPolicyResult,
} from "../policy/index.js";
import type {
  AutomationProviderId,
  AutomationProviderResult,
} from "../provider/index.js";

export type AutomationOrchestratorMetadata = Readonly<{
  schemaVersion: 1;
  orchestratorId: string;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AutomationOrchestratorContext = Readonly<{
  automationContext: AutomationContext;
  assembly: AutomationApplicationAssembly;
  metadata: AutomationOrchestratorMetadata;
}>;

export type AutomationOrchestratorRequest = Readonly<{
  requestId: string;
  automationRequest: AutomationRequest;
  context: AutomationOrchestratorContext;
  metadata: AutomationOrchestratorMetadata;
}>;

export type AutomationOrchestratorInput = Readonly<{
  request: AutomationOrchestratorRequest;
  metadata: AutomationOrchestratorMetadata;
}>;

/**
 * Declarative lifecycle state. This union does not define a transition model
 * or permit a caller to infer a runtime execution path.
 */
export type AutomationOrchestratorState = Readonly<{
  status:
    | "received"
    | "policy_evaluated"
    | "delegation_selected"
    | "completed"
    | "failed";
  metadata: AutomationOrchestratorMetadata;
}>;

export type AutomationOrchestratorDecision =
  | Readonly<{
      status: "allowed";
      policyResult: AutomationPolicyResult;
      policyDecision: AutomationPolicyDecision;
      providerId: AutomationProviderId;
      forgeId: AutomationForgeId;
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationOrchestratorMetadata;
    }>
  | Readonly<{
      status: "rejected";
      policyResult: AutomationPolicyResult;
      policyDecision: AutomationPolicyDecision | null;
      providerId: null;
      forgeId: null;
      delegationOccurred: false;
      providerInvoked: false;
      forgeInvoked: false;
      executionStarted: false;
      metadata: AutomationOrchestratorMetadata;
    }>;

/**
 * One declared orchestration boundary. It is descriptive data only; it does
 * not invoke a policy, provider, forge, or adapter.
 */
export type AutomationOrchestratorStep = Readonly<{
  stepId: string;
  kind: "policy_evaluation" | "provider_delegation" | "forge_delegation";
  state: AutomationOrchestratorState;
  decision: AutomationOrchestratorDecision | null;
  metadata: AutomationOrchestratorMetadata;
}>;

export type AutomationOrchestratorFailure = Readonly<{
  code:
    | "invalid_input"
    | "assembly_rejected"
    | "policy_denied"
    | "policy_failed"
    | "selection_rejected"
    | "provider_rejected"
    | "forge_rejected"
    | "result_invalid";
  message: string;
  metadata: AutomationOrchestratorMetadata;
}>;

export type AutomationOrchestratorResult =
  | Readonly<{
      status: "completed";
      state: AutomationOrchestratorState;
      decision: AutomationOrchestratorDecision;
      steps: readonly AutomationOrchestratorStep[];
      result: AutomationResult;
      providerResult: AutomationProviderResult | null;
      forgeResult: AutomationForgeResult | null;
      failure: null;
      metadata: AutomationOrchestratorMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      state: AutomationOrchestratorState;
      decision: AutomationOrchestratorDecision | null;
      steps: readonly AutomationOrchestratorStep[];
      result: null;
      providerResult: AutomationProviderResult | null;
      forgeResult: AutomationForgeResult | null;
      failure: AutomationOrchestratorFailure;
      metadata: AutomationOrchestratorMetadata;
    }>;

/**
 * Public orchestration port. Implementations must receive all dependencies
 * through the immutable input and return a bounded, fail-closed result.
 */
export interface AutomationOrchestrator {
  orchestrate(input: AutomationOrchestratorInput): AutomationOrchestratorResult;
}

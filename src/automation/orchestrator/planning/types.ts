/**
 * V19.3 public Automation Orchestrator Planning contracts.
 *
 * This package describes deterministic, fail-closed planning data only. It
 * supplies no planner implementation, execution logic, scheduling algorithm,
 * retry, timer, concurrency, runtime effect, or dependency discovery.
 */

import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorContext,
  AutomationOrchestratorRequest,
} from "../index.js";
import type {
  AutomationOrchestratorEvaluation,
  AutomationOrchestratorEvaluationContext,
  AutomationOrchestratorEvaluationResult,
} from "../evaluation/index.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";

export type AutomationOrchestratorPlanStatus =
  "planned" | "rejected" | "failed";

export type AutomationOrchestratorPlanDependency = Readonly<{
  dependencyId: string;
  kind: "evaluation" | "policy_decision" | "plan_step";
  reference: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanConstraint = Readonly<{
  constraintId: string;
  kind: "capability" | "policy" | "dependency";
  status: "satisfied" | "unsatisfied";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanContext = Readonly<{
  orchestratorContext: AutomationOrchestratorContext;
  evaluationContext: AutomationOrchestratorEvaluationContext;
  evaluationResult: AutomationOrchestratorEvaluationResult;
  policyDecision: AutomationPolicyDecision | null;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanInput = Readonly<{
  planId: string;
  request: AutomationOrchestratorRequest;
  context: AutomationOrchestratorPlanContext;
  evaluation: AutomationOrchestratorEvaluation;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanStep = Readonly<{
  stepId: string;
  status: "planned" | "blocked";
  dependencies: readonly AutomationOrchestratorPlanDependency[];
  constraints: readonly AutomationOrchestratorPlanConstraint[];
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanFailure = Readonly<{
  code:
    | "invalid_input"
    | "invalid_context"
    | "evaluation_rejected"
    | "evaluation_failed"
    | "policy_denied"
    | "constraint_unsatisfied"
    | "dependency_invalid";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlan = Readonly<{
  planId: string;
  input: AutomationOrchestratorPlanInput;
  status: AutomationOrchestratorPlanStatus;
  steps: readonly AutomationOrchestratorPlanStep[];
  dependencies: readonly AutomationOrchestratorPlanDependency[];
  constraints: readonly AutomationOrchestratorPlanConstraint[];
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
  metadata: AutomationMetadata;
}>;

export type AutomationOrchestratorPlanResult =
  | Readonly<{
      status: "planned";
      plan: AutomationOrchestratorPlan;
      failure: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      plan: AutomationOrchestratorPlan | null;
      failure: AutomationOrchestratorPlanFailure;
      metadata: AutomationMetadata;
    }>;

/**
 * Public port for deterministic planning. This interface is declarative only;
 * an implementation is responsible for any planning behavior.
 */
export interface AutomationOrchestratorPlanner {
  plan(
    input: AutomationOrchestratorPlanInput,
  ): AutomationOrchestratorPlanResult;
}

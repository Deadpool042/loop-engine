import {
  AGENT_EFFORTS,
  type AgentEffort,
} from "../agents/types.js";
import type { LoopRuntimeExecutionPlan } from "./loop-runtime-public-request-execution-plan.js";

export type LoopRuntimeRequestOptionsMapping = Readonly<{
  project: string;
  cycleId?: string;
  mode: "dry-run" | "execute";
  policyId: string;
  profileId: string;
  effort: AgentEffort;
  limits: Readonly<{
    maxTokens: number;
    maxCostUsd: number;
    maxDurationMs: number;
    maxCalls: number;
    maxRepairs: number;
  }>;
}>;

export type LoopRuntimeRequestOptionsMappingFailureReason =
  | "invalid_execution_plan"
  | "unsupported_mode";

export type LoopRuntimeRequestOptionsMappingResult =
  | Readonly<{
      mapped: true;
      options: LoopRuntimeRequestOptionsMapping;
    }>
  | Readonly<{
      mapped: false;
      reason: LoopRuntimeRequestOptionsMappingFailureReason;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isKnownEffort(effort: unknown): effort is AgentEffort {
  return AGENT_EFFORTS.includes(effort as AgentEffort);
}

function invalidExecutionPlan(): LoopRuntimeRequestOptionsMappingResult {
  return Object.freeze({
    mapped: false,
    reason: "invalid_execution_plan" as const,
  });
}

function unsupportedMode(): LoopRuntimeRequestOptionsMappingResult {
  return Object.freeze({
    mapped: false,
    reason: "unsupported_mode" as const,
  });
}

function isValidLimits(
  budget: unknown,
): budget is LoopRuntimeExecutionPlan["budget"] {
  return (
    isPlainObject(budget) &&
    isSafeNonNegativeInteger(budget.maxTokens) &&
    typeof budget.maxCostUsd === "number" &&
    Number.isFinite(budget.maxCostUsd) &&
    budget.maxCostUsd >= 0 &&
    isSafeNonNegativeInteger(budget.maxDurationMs) &&
    isSafeNonNegativeInteger(budget.maxCalls) &&
    isSafeNonNegativeInteger(budget.maxRepairs)
  );
}

function toFrozenLimits(
  limits: LoopRuntimeExecutionPlan["budget"],
): LoopRuntimeRequestOptionsMapping["limits"] {
  return Object.freeze({
    maxTokens: limits.maxTokens,
    maxCostUsd: limits.maxCostUsd,
    maxDurationMs: limits.maxDurationMs,
    maxCalls: limits.maxCalls,
    maxRepairs: limits.maxRepairs,
  });
}

export function mapLoopRuntimeExecutionPlanToRequestOptions(
  plan: LoopRuntimeExecutionPlan,
): LoopRuntimeRequestOptionsMappingResult {
  if (
    !isPlainObject(plan) ||
    !isNonEmptyTrimmedString(plan.project) ||
    (plan.cycleId !== undefined && !isNonEmptyTrimmedString(plan.cycleId)) ||
    !isNonEmptyTrimmedString(plan.policyId) ||
    !isNonEmptyTrimmedString(plan.profileId) ||
    !isKnownEffort(plan.effort) ||
    !isValidLimits(plan.budget)
  ) {
    return invalidExecutionPlan();
  }

  if (plan.mode !== "dry-run" && plan.mode !== "execute") {
    return unsupportedMode();
  }

  return Object.freeze({
    mapped: true as const,
    options: Object.freeze({
      project: plan.project,
      mode: plan.mode,
      policyId: plan.policyId,
      profileId: plan.profileId,
      effort: plan.effort,
      ...(plan.cycleId === undefined ? {} : { cycleId: plan.cycleId }),
      limits: toFrozenLimits(plan.budget),
    }),
  });
}

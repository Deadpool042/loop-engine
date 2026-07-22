import {
  AGENT_EFFORTS,
  compareAgentEffort,
  type AgentEffort,
} from "../agents/types.js";
import type { LoopRuntimeLimitedRequestConfiguration } from "./loop-runtime-public-request-limits.js";

export type LoopRuntimeExecutionPlan = Readonly<{
  project: string;
  cycleId?: string;
  mode: "dry-run" | "execute";
  policyId: string;
  profileId: string;
  effort: AgentEffort;
  budget: Readonly<{
    maxTokens: number;
    maxCostUsd: number;
    maxDurationMs: number;
    maxCalls: number;
    maxRepairs: number;
  }>;
}>;

export type LoopRuntimeExecutionPlanFailureReason =
  | "reference_mismatch"
  | "invalid_limited_configuration";

export type LoopRuntimeExecutionPlanResult =
  | Readonly<{
      planned: true;
      plan: LoopRuntimeExecutionPlan;
    }>
  | Readonly<{
      planned: false;
      reason: LoopRuntimeExecutionPlanFailureReason;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKnownEffort(effort: unknown): effort is AgentEffort {
  return AGENT_EFFORTS.includes(effort as AgentEffort);
}

function invalidLimitedConfiguration(): LoopRuntimeExecutionPlanResult {
  return Object.freeze({
    planned: false,
    reason: "invalid_limited_configuration" as const,
  });
}

function referenceMismatch(): LoopRuntimeExecutionPlanResult {
  return Object.freeze({
    planned: false,
    reason: "reference_mismatch" as const,
  });
}

function isValidBudget(
  budget: unknown,
  publicBudget: LoopRuntimeLimitedRequestConfiguration["request"]["budget"],
): budget is LoopRuntimeExecutionPlan["budget"] {
  return (
    isPlainObject(budget) &&
    isSafeNonNegativeInteger(budget.maxTokens) &&
    typeof budget.maxCostUsd === "number" &&
    Number.isFinite(budget.maxCostUsd) &&
    budget.maxCostUsd >= 0 &&
    isSafeNonNegativeInteger(budget.maxDurationMs) &&
    isSafeNonNegativeInteger(budget.maxCalls) &&
    isSafeNonNegativeInteger(budget.maxRepairs) &&
    budget.maxTokens <= publicBudget.maxTokens &&
    budget.maxCostUsd <= publicBudget.maxCostUsd &&
    budget.maxDurationMs <= publicBudget.maxDurationMs &&
    budget.maxCalls <= publicBudget.maxCalls &&
    budget.maxRepairs <= publicBudget.maxRepairs
  );
}

function isValidPlanConfiguration(
  configuration: LoopRuntimeLimitedRequestConfiguration,
): configuration is LoopRuntimeLimitedRequestConfiguration {
  const { request, policy, profile, effectiveBudget, effectiveEffort } =
    configuration;

  return (
    isPlainObject(request) &&
    isPlainObject(policy) &&
    isPlainObject(profile) &&
    isNonEmptyTrimmedString(request.project) &&
    (request.cycleId === undefined ||
      isNonEmptyTrimmedString(request.cycleId)) &&
    (request.mode === "dry-run" || request.mode === "execute") &&
    isNonEmptyTrimmedString(request.policyRef) &&
    isNonEmptyTrimmedString(request.profileRef) &&
    isNonEmptyTrimmedString(policy.policyRef) &&
    isNonEmptyTrimmedString(profile.profileRef) &&
    isNonEmptyTrimmedString(policy.policyId) &&
    isNonEmptyTrimmedString(profile.profileId) &&
    isKnownEffort(effectiveEffort) &&
    isKnownEffort(request.requestedMaxEffort) &&
    isKnownEffort(profile.maxEffort) &&
    isValidBudget(effectiveBudget, request.budget) &&
    compareAgentEffort(effectiveEffort, request.requestedMaxEffort) <= 0 &&
    compareAgentEffort(effectiveEffort, profile.maxEffort) <= 0
  );
}

export function createLoopRuntimeExecutionPlan(
  configuration: LoopRuntimeLimitedRequestConfiguration,
): LoopRuntimeExecutionPlanResult {
  if (
    !isPlainObject(configuration) ||
    !isPlainObject(configuration.request) ||
    !isPlainObject(configuration.policy) ||
    !isPlainObject(configuration.profile) ||
    !isNonEmptyTrimmedString(configuration.request.policyRef) ||
    !isNonEmptyTrimmedString(configuration.request.profileRef) ||
    !isNonEmptyTrimmedString(configuration.policy.policyRef) ||
    !isNonEmptyTrimmedString(configuration.profile.profileRef)
  ) {
    return invalidLimitedConfiguration();
  }

  if (
    configuration.policy.policyRef !== configuration.request.policyRef ||
    configuration.profile.profileRef !== configuration.request.profileRef
  ) {
    return referenceMismatch();
  }

  if (!isValidPlanConfiguration(configuration)) {
    return invalidLimitedConfiguration();
  }

  return Object.freeze({
    planned: true as const,
    plan: Object.freeze({
      project: configuration.request.project,
      mode: configuration.request.mode,
      policyId: configuration.policy.policyId,
      profileId: configuration.profile.profileId,
      effort: configuration.effectiveEffort,
      ...(configuration.request.cycleId === undefined
        ? {}
        : { cycleId: configuration.request.cycleId }),
      budget: Object.freeze({
        maxTokens: configuration.effectiveBudget.maxTokens,
        maxCostUsd: configuration.effectiveBudget.maxCostUsd,
        maxDurationMs: configuration.effectiveBudget.maxDurationMs,
        maxCalls: configuration.effectiveBudget.maxCalls,
        maxRepairs: configuration.effectiveBudget.maxRepairs,
      }),
    }),
  });
}

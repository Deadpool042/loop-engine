import {
  AGENT_EFFORTS,
  compareAgentEffort,
  type AgentEffort,
} from "../agents/types.js";
import type { LoopRuntimeResolvedRequestConfiguration } from "./loop-runtime-public-request-configuration.js";
import type {
  LoopRuntimeResolvedProfileConfiguration,
  LoopRuntimeResolvedPolicyConfiguration,
} from "./loop-runtime-public-request-configuration.js";
import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";

export type LoopRuntimeInternalLimits = Readonly<{
  maxEffort: AgentEffort;
  budget: Readonly<{
    maxTokens: number;
    maxCostUsd: number;
    maxDurationMs: number;
    maxCalls: number;
    maxRepairs: number;
  }>;
}>;

export type LoopRuntimeLimitedRequestConfiguration = Readonly<{
  request: LoopRuntimePublicRequest;
  policy: LoopRuntimeResolvedPolicyConfiguration;
  profile: LoopRuntimeResolvedProfileConfiguration;
  effectiveEffort: AgentEffort;
  effectiveBudget: LoopRuntimePublicRequest["budget"];
}>;

export type LoopRuntimeRequestLimitFailureReason =
  | "invalid_internal_limits"
  | "unsupported_effort_order";

export type LoopRuntimeRequestLimitResult =
  | Readonly<{
      limited: true;
      configuration: LoopRuntimeLimitedRequestConfiguration;
    }>
  | Readonly<{
      limited: false;
      reason: LoopRuntimeRequestLimitFailureReason;
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

function isValidInternalBudget(
  budget: unknown,
): budget is LoopRuntimeInternalLimits["budget"] {
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

function invalidInternalLimits(): LoopRuntimeRequestLimitResult {
  return Object.freeze({
    limited: false,
    reason: "invalid_internal_limits" as const,
  });
}

function unsupportedEffortOrder(): LoopRuntimeRequestLimitResult {
  return Object.freeze({
    limited: false,
    reason: "unsupported_effort_order" as const,
  });
}

function isKnownEffort(effort: unknown): effort is AgentEffort {
  return AGENT_EFFORTS.includes(effort as AgentEffort);
}

function clampBudget(
  publicBudget: LoopRuntimePublicRequest["budget"],
  internalBudget: LoopRuntimeInternalLimits["budget"],
): LoopRuntimePublicRequest["budget"] {
  return Object.freeze({
    maxTokens: Math.min(publicBudget.maxTokens, internalBudget.maxTokens),
    maxCostUsd: Math.min(publicBudget.maxCostUsd, internalBudget.maxCostUsd),
    maxDurationMs: Math.min(
      publicBudget.maxDurationMs,
      internalBudget.maxDurationMs,
    ),
    maxCalls: Math.min(publicBudget.maxCalls, internalBudget.maxCalls),
    maxRepairs: Math.min(publicBudget.maxRepairs, internalBudget.maxRepairs),
  });
}

function selectMinimumEffort(efforts: readonly AgentEffort[]): AgentEffort {
  let selectedEffort = efforts[0]!;

  for (const effort of efforts.slice(1)) {
    if (compareAgentEffort(effort, selectedEffort) < 0) {
      selectedEffort = effort;
    }
  }

  return selectedEffort;
}

export function applyLoopRuntimeInternalLimits(
  configuration: LoopRuntimeResolvedRequestConfiguration,
  limits: LoopRuntimeInternalLimits,
): LoopRuntimeRequestLimitResult {
  if (
    !isPlainObject(limits) ||
    !isValidInternalBudget(limits.budget) ||
    !isKnownEffort(limits.maxEffort)
  ) {
    return invalidInternalLimits();
  }

  if (
    !isKnownEffort(configuration.request.requestedMaxEffort) ||
    !isKnownEffort(configuration.profile.maxEffort)
  ) {
    return unsupportedEffortOrder();
  }

  const effectiveEffort = selectMinimumEffort([
    configuration.request.requestedMaxEffort,
    configuration.profile.maxEffort,
    limits.maxEffort,
  ]);

  return Object.freeze({
    limited: true as const,
    configuration: Object.freeze({
      request: configuration.request,
      policy: configuration.policy,
      profile: configuration.profile,
      effectiveEffort,
      effectiveBudget: clampBudget(configuration.request.budget, limits.budget),
    }),
  });
}

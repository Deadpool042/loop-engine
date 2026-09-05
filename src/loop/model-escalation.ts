import type { AgentRegistry } from "../agents/registry.js";
import type { AgentFailureReason } from "../agents/escalation.js";
import {
  evaluateAgentProfile,
  pickSmallestCapable,
  type AgentRejection,
  type AgentSelectionRequest,
} from "../agents/selector.js";
import {
  agentEconomicTierRank,
  type AgentEconomicTier,
  type AgentProfile,
} from "../agents/types.js";
import type { LoopExecutionPlan } from "./execution-plan.js";

export const LOOP_MODEL_ESCALATION_SCHEMA_VERSION = 1 as const;

export const LOOP_MODEL_ESCALATION_REASONS = [
  "capability_gap",
  "validation_failed",
] as const;

export type LoopModelEscalationReason =
  (typeof LOOP_MODEL_ESCALATION_REASONS)[number];

export const LOOP_MODEL_ESCALATION_NOT_APPLICABLE_REASONS = [
  "budget_exceeded_forbids_cost_escalation",
  "runtime_error_requires_provider_or_runtime_change",
  "previous_profile_economic_tier_unknown",
  "capability_gap_not_demonstrated",
] as const;

export type LoopModelEscalationNotApplicableReason =
  (typeof LOOP_MODEL_ESCALATION_NOT_APPLICABLE_REASONS)[number];

export type LoopModelEscalationSelection =
  | Readonly<{
      outcome: "escalated";
      profile: AgentProfile;
      failureReason: LoopModelEscalationReason;
      rejected: readonly AgentRejection[];
    }>
  | Readonly<{
      outcome: "exhausted";
      failureReason: LoopModelEscalationReason;
      rejected: readonly AgentRejection[];
    }>
  | Readonly<{
      outcome: "not_applicable";
      failureReason: AgentFailureReason;
      reason: LoopModelEscalationNotApplicableReason;
      rejected: readonly AgentRejection[];
    }>;

export type LoopModelEscalationProfileEvidence = Readonly<{
  profileId: string;
  provider: string;
  runtime: string;
  model: string;
  economicTier: AgentEconomicTier | null;
}>;

export type LoopModelEscalationEvidence = Readonly<{
  schemaVersion: typeof LOOP_MODEL_ESCALATION_SCHEMA_VERSION;
  reason: LoopModelEscalationReason;
  outcome: "escalated" | "exhausted" | "not_authorized" | "not_applicable";
  maxCalls: number;
  callsUsed: number;
  from: LoopModelEscalationProfileEvidence;
  to: LoopModelEscalationProfileEvidence | null;
  detail: string | null;
}>;

function notApplicable(
  failureReason: AgentFailureReason,
  reason: LoopModelEscalationNotApplicableReason,
  rejected: readonly AgentRejection[] = [],
): LoopModelEscalationSelection {
  return Object.freeze({
    outcome: "not_applicable" as const,
    failureReason,
    reason,
    rejected: Object.freeze([...rejected]),
  });
}

/**
 * V48.5 model-tier escalation. Separate from the historical Agent escalation
 * contract so existing V7/V13 runtime behavior is not silently redefined.
 *
 * Hard invariants:
 * - only capability_gap and validation_failed can increase model tier;
 * - provider/runtime never change;
 * - economic tier must strictly increase;
 * - every normal admission gate still applies;
 * - capability_gap must be demonstrated by the updated request;
 * - at most one profile is returned; execution budgeting stays in LoopRunner.
 */
export function selectIntraProviderModelEscalation(input: Readonly<{
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  failureReason: AgentFailureReason;
}>): LoopModelEscalationSelection {
  const previousProfile = input.registry.profiles.find(
    (profile) => profile.id === input.previousProfileId,
  );
  if (!previousProfile) {
    throw new Error(
      `Unknown previous agent profile: ${input.previousProfileId}`,
    );
  }

  if (input.failureReason === "budget_exceeded") {
    return notApplicable(
      input.failureReason,
      "budget_exceeded_forbids_cost_escalation",
    );
  }
  if (input.failureReason === "runtime_error") {
    return notApplicable(
      input.failureReason,
      "runtime_error_requires_provider_or_runtime_change",
    );
  }

  if (previousProfile.economicTier === undefined) {
    return notApplicable(
      input.failureReason,
      "previous_profile_economic_tier_unknown",
    );
  }

  if (input.failureReason === "capability_gap") {
    const previousEvaluation = evaluateAgentProfile(
      previousProfile,
      input.request,
    );
    if (
      previousEvaluation.ok ||
      !previousEvaluation.reason.startsWith("missing capabilities:")
    ) {
      return notApplicable(
        input.failureReason,
        "capability_gap_not_demonstrated",
      );
    }
  }

  const previousTierRank = agentEconomicTierRank(
    previousProfile.economicTier,
  );
  const rejected: AgentRejection[] = [];
  const eligible: AgentProfile[] = [];

  for (const profile of [...input.registry.profiles].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (profile.id === previousProfile.id) {
      rejected.push({
        profileId: profile.id,
        reason: "excluded: this is the profile that just failed",
      });
      continue;
    }
    if (
      profile.provider !== previousProfile.provider ||
      profile.runtime !== previousProfile.runtime
    ) {
      rejected.push({
        profileId: profile.id,
        reason:
          "provider/runtime change is outside intra-provider escalation",
      });
      continue;
    }
    if (profile.economicTier === undefined) {
      rejected.push({
        profileId: profile.id,
        reason: "economic tier is not declared",
      });
      continue;
    }
    if (agentEconomicTierRank(profile.economicTier) <= previousTierRank) {
      rejected.push({
        profileId: profile.id,
        reason:
          `economic tier ${profile.economicTier} does not exceed failed profile tier ${previousProfile.economicTier}`,
      });
      continue;
    }

    const evaluation = evaluateAgentProfile(profile, input.request);
    if (evaluation.ok) eligible.push(profile);
    else rejected.push({ profileId: profile.id, reason: evaluation.reason });
  }

  const selected = pickSmallestCapable(eligible);
  if (!selected) {
    return Object.freeze({
      outcome: "exhausted" as const,
      failureReason: input.failureReason,
      rejected: Object.freeze(rejected),
    });
  }

  return Object.freeze({
    outcome: "escalated" as const,
    profile: selected,
    failureReason: input.failureReason,
    rejected: Object.freeze(rejected),
  });
}

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function intersectBudget(
  primary: LoopExecutionPlan["budget"],
  profile: AgentProfile["budget"],
): LoopExecutionPlan["budget"] {
  return Object.freeze({
    maxTokens: minNullable(primary.maxTokens, profile.maxTokens),
    maxCostUsd: minNullable(primary.maxCostUsd, profile.maxCostUsd),
    maxDurationMs: minNullable(primary.maxDurationMs, profile.maxDurationMs),
    maxCalls: minNullable(primary.maxCalls, profile.maxCalls),
    maxRepairs: minNullable(primary.maxRepairs, profile.maxRepairs),
  });
}

export function modelEscalationProfileEvidence(
  profile: AgentProfile,
): LoopModelEscalationProfileEvidence {
  return Object.freeze({
    profileId: profile.id,
    provider: profile.provider,
    runtime: profile.runtime,
    model: profile.model,
    economicTier: profile.economicTier ?? null,
  });
}

export function createIntraProviderEscalationPlan(
  primaryPlan: LoopExecutionPlan,
  profile: AgentProfile,
  reason: LoopModelEscalationReason,
): LoopExecutionPlan {
  if (
    profile.provider !== primaryPlan.provider ||
    profile.runtime !== primaryPlan.runtime
  ) {
    throw new TypeError(
      "Intra-provider escalation cannot change provider or runtime.",
    );
  }

  const missingCapabilities = primaryPlan.policy.requiredCapabilities.filter(
    (capability) => !profile.capabilities.includes(capability),
  );
  const missingPermissions = primaryPlan.policy.requiredPermissions.filter(
    (permission) => !profile.permissions.includes(permission),
  );
  if (missingCapabilities.length > 0 || missingPermissions.length > 0) {
    throw new TypeError(
      "Escalated profile does not satisfy the admitted execution policy.",
    );
  }

  return Object.freeze({
    ...primaryPlan,
    profileId: profile.id,
    model: profile.model,
    effort: primaryPlan.effort,
    delegation: primaryPlan.delegation,
    budget: intersectBudget(primaryPlan.budget, profile.budget),
    policy: Object.freeze({
      ...primaryPlan.policy,
      requiredCapabilities: Object.freeze([
        ...primaryPlan.policy.requiredCapabilities,
      ]),
      requiredPermissions: Object.freeze([
        ...primaryPlan.policy.requiredPermissions,
      ]),
      rationale: Object.freeze([
        ...primaryPlan.policy.rationale,
        `Intra-provider model escalation: ${reason} -> ${profile.id}.`,
      ]),
    }),
  });
}

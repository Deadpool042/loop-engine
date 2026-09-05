import type { AgentRegistry } from "./registry.js";
import {
  AGENT_ECONOMIC_TIERS,
  agentEconomicTierRank,
  agentFundingModeRank,
  compareAgentEffort,
  type AgentBudget,
  type AgentCapability,
  type AgentEffort,
  type AgentFundingMode,
  type AgentPermission,
  type AgentProfile,
  type AgentProvider,
  type AgentRuntime,
} from "./types.js";

export type AgentBudgetCeiling = Partial<
  Pick<
    AgentBudget,
    "maxTokens" | "maxCostUsd" | "maxDurationMs" | "maxCalls" | "maxRepairs"
  >
>;

export type AgentSelectionRequest = Readonly<{
  requiredCapabilities: readonly AgentCapability[];
  requiredPermissions: readonly AgentPermission[];
  minEffort?: AgentEffort;
  maxEffort?: AgentEffort;
  budgetCeiling?: AgentBudgetCeiling;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  allowedFundingModes?: readonly AgentFundingMode[];
}>;

export type AgentRejection = Readonly<{
  profileId: string;
  reason: string;
}>;

// Compact audit evidence for profiles that passed every hard gate but lost
// deterministic ranking. It deliberately repeats no profile configuration.
export type AgentNonSelection = Readonly<{
  profileId: string;
  reason:
    | "less_preferred_funding_than_selected"
    | "higher_economic_tier_than_selected"
    | "economic_tier_unranked"
    | "higher_effort_than_selected"
    | "deterministic_tiebreak";
}>;

export type AgentSelectionResult =
  | Readonly<{
      outcome: "selected";
      profile: AgentProfile;
      rejected: readonly AgentRejection[];
      // Additive so historical serialized resolutions remain consumable.
      notSelected?: readonly AgentNonSelection[];
    }>
  | Readonly<{ outcome: "no_match"; rejected: readonly AgentRejection[] }>;

const BUDGET_DIMENSIONS = [
  "maxTokens",
  "maxCostUsd",
  "maxDurationMs",
  "maxCalls",
  "maxRepairs",
] as const;

function findBudgetViolation(
  budget: AgentBudget,
  ceiling: AgentBudgetCeiling,
): string | null {
  for (const dimension of BUDGET_DIMENSIONS) {
    const ceilingValue = ceiling[dimension];

    if (ceilingValue == null) continue;

    const profileValue = budget[dimension];
    if (profileValue === null || profileValue > ceilingValue) {
      return `budget.${dimension} (${profileValue ?? "unbounded"}) exceeds ceiling (${ceilingValue})`;
    }
  }

  return null;
}

export function evaluateAgentProfile(
  profile: AgentProfile,
  request: AgentSelectionRequest,
): Readonly<{ ok: true } | { ok: false; reason: string }> {
  if (profile.availability === "unavailable") {
    return {
      ok: false,
      reason: "profile is explicitly unavailable",
    };
  }

  if (profile.quota?.state === "exhausted") {
    return {
      ok: false,
      reason: `profile quota is exhausted (source: ${profile.quota.source})`,
    };
  }

  const fundingMode = profile.fundingMode ?? "unknown";
  const paidFunding =
    fundingMode === "additional_credits" || fundingMode === "metered_api";
  if (request.allowedFundingModes === undefined && paidFunding) {
    return {
      ok: false,
      reason: `paid funding mode ${fundingMode} requires explicit authorization`,
    };
  }
  if (
    request.allowedFundingModes !== undefined &&
    !request.allowedFundingModes.includes(fundingMode)
  ) {
    return {
      ok: false,
      reason: `funding mode ${fundingMode} is not allowed`,
    };
  }

  if (
    request.allowedProviders !== undefined &&
    !request.allowedProviders.includes(profile.provider)
  ) {
    return {
      ok: false,
      reason: `provider ${profile.provider} is not allowed`,
    };
  }

  if (
    request.allowedRuntimes !== undefined &&
    !request.allowedRuntimes.includes(profile.runtime)
  ) {
    return {
      ok: false,
      reason: `runtime ${profile.runtime} is not allowed`,
    };
  }

  const missingCapabilities = request.requiredCapabilities.filter(
    (capability) => !profile.capabilities.includes(capability),
  );

  if (missingCapabilities.length > 0) {
    return {
      ok: false,
      reason: `missing capabilities: ${missingCapabilities.join(", ")}`,
    };
  }

  const missingPermissions = request.requiredPermissions.filter(
    (permission) => !profile.permissions.includes(permission),
  );

  if (missingPermissions.length > 0) {
    return {
      ok: false,
      reason: `missing permissions: ${missingPermissions.join(", ")}`,
    };
  }

  // Minimum effort is an invocation setting resolved by policy, not a fixed
  // provider capability. A low-preference profile can therefore execute a
  // medium-effort invocation. Maximum effort remains a selection ceiling so
  // an expensive profile cannot bypass an explicit caller limit.
  if (
    request.maxEffort &&
    compareAgentEffort(profile.effort, request.maxEffort) > 0
  ) {
    return {
      ok: false,
      reason: `effort ${profile.effort} exceeds max effort ${request.maxEffort}`,
    };
  }

  if (request.budgetCeiling) {
    const violation = findBudgetViolation(
      profile.budget,
      request.budgetCeiling,
    );
    if (violation) return { ok: false, reason: violation };
  }

  return { ok: true };
}

function fundingModeRank(profile: AgentProfile): number {
  return agentFundingModeRank(profile.fundingMode ?? "unknown");
}

function economicTierRank(profile: AgentProfile): number {
  return profile.economicTier === undefined
    ? AGENT_ECONOMIC_TIERS.length
    : agentEconomicTierRank(profile.economicTier);
}

function compareEligibleProfiles(
  a: AgentProfile,
  b: AgentProfile,
): number {
  return (
    fundingModeRank(a) - fundingModeRank(b) ||
    economicTierRank(a) - economicTierRank(b) ||
    compareAgentEffort(a.effort, b.effort) ||
    a.id.localeCompare(b.id)
  );
}

export function pickSmallestCapable(
  profiles: readonly AgentProfile[],
): AgentProfile | null {
  if (profiles.length === 0) return null;

  return [...profiles].sort(compareEligibleProfiles)[0] ?? null;
}

function canonicalizeSelectedProfile(profile: AgentProfile): AgentProfile {
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze([...new Set(profile.capabilities)].sort()),
    permissions: Object.freeze([...new Set(profile.permissions)].sort()),
    ...(profile.tiers === undefined
      ? {}
      : { tiers: Object.freeze([...new Set(profile.tiers)].sort()) }),
    ...(profile.quota === undefined
      ? {}
      : { quota: Object.freeze({ ...profile.quota }) }),
    budget: Object.freeze({ ...profile.budget }),
  });
}

export function selectAgentProfile(
  registry: AgentRegistry,
  request: AgentSelectionRequest,
): AgentSelectionResult {
  const rejected: AgentRejection[] = [];
  const eligible: AgentProfile[] = [];

  // Registry declaration order is not a selection input. Sorting first keeps
  // rejection evidence and the observable decision stable across equivalent
  // registry serializations.
  for (const profile of [...registry.profiles].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const evaluation = evaluateAgentProfile(profile, request);

    if (evaluation.ok) eligible.push(profile);
    else rejected.push({ profileId: profile.id, reason: evaluation.reason });
  }

  const selected = pickSmallestCapable(eligible);
  if (!selected) return { outcome: "no_match", rejected };

  const selectedFundingModeRank = fundingModeRank(selected);
  const selectedEconomicTierRank = economicTierRank(selected);
  const notSelected: AgentNonSelection[] = eligible
    .filter((profile) => profile.id !== selected.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((profile) => {
      const profileFundingModeRank = fundingModeRank(profile);
      const profileEconomicTierRank = economicTierRank(profile);
      let reason: AgentNonSelection["reason"];

      if (profileFundingModeRank > selectedFundingModeRank) {
        reason = "less_preferred_funding_than_selected";
      } else if (
        selected.economicTier !== undefined &&
        profile.economicTier === undefined
      ) {
        reason = "economic_tier_unranked";
      } else if (profileEconomicTierRank > selectedEconomicTierRank) {
        reason = "higher_economic_tier_than_selected";
      } else if (compareAgentEffort(profile.effort, selected.effort) > 0) {
        reason = "higher_effort_than_selected";
      } else {
        reason = "deterministic_tiebreak";
      }

      return { profileId: profile.id, reason };
    });

  return {
    outcome: "selected",
    profile: canonicalizeSelectedProfile(selected),
    rejected,
    notSelected,
  };
}

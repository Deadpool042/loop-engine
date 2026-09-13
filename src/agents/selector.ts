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
  preferredProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  allowedFundingModes?: readonly AgentFundingMode[];
  /** Require explicit usable quota evidence before a profile can compete. */
  requireKnownQuota?: boolean;
  /**
   * Explicit opt-in for letting a frontier-tier profile compete when a known
   * lower economic tier already satisfies every hard requirement. Omitted
   * means frontier is used only when no known lower-tier capable alternative
   * exists.
   */
  allowFrontier?: boolean;
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
    | "less_preferred_provider_than_selected"
    | "higher_effort_than_selected"
    | "frontier_not_required"
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

export type AgentEfficiencySignal =
  | Readonly<{
      profileId: string;
      status: "available";
      quotaWindowLabel: string;
      expectedValuePercent: number;
      expectedQuotaConsumedPercent: number;
      sampleSize: number;
    }>
  | Readonly<{
      profileId: string;
      status: "unknown";
      reason: string;
    }>;

export type AgentEfficiencyRankingResult = Readonly<{
  rejected: readonly AgentRejection[];
  ranked: readonly Readonly<{
    profileId: string;
    quotaWindowLabel: string;
    expectedValuePercent: number;
    expectedQuotaConsumedPercent: number;
    score: number;
    sampleSize: number;
  }>[];
  unranked: readonly Readonly<{
    profileId: string;
    reason:
      | "efficiency_unknown"
      | "invalid_efficiency_signal"
      | "frontier_not_required";
  }>[];
}>;

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
  if (
    request.requireKnownQuota === true &&
    profile.quota?.state !== "available"
  ) {
    return {
      ok: false,
      reason: `profile quota is not proven available (source: ${profile.quota?.source ?? "unavailable"})`,
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

function providerPreferenceRank(
  profile: AgentProfile,
  preferredProviders: readonly AgentProvider[] | undefined,
): number {
  if (preferredProviders === undefined) return 0;
  const index = preferredProviders.indexOf(profile.provider);
  return index < 0 ? preferredProviders.length : index;
}

function compareEligibleProfiles(
  a: AgentProfile,
  b: AgentProfile,
  preferredProviders?: readonly AgentProvider[],
): number {
  return (
    fundingModeRank(a) - fundingModeRank(b) ||
    economicTierRank(a) - economicTierRank(b) ||
    compareAgentEffort(a.effort, b.effort) ||
    providerPreferenceRank(a, preferredProviders) -
      providerPreferenceRank(b, preferredProviders) ||
    a.id.localeCompare(b.id)
  );
}

function applyFrontierGate(
  eligible: readonly AgentProfile[],
  request: AgentSelectionRequest,
): Readonly<{
  competitive: readonly AgentProfile[];
  heldBack: readonly AgentProfile[];
}> {
  if (request.allowFrontier === true) {
    return Object.freeze({
      competitive: Object.freeze([...eligible]),
      heldBack: Object.freeze([]),
    });
  }

  const knownLowerTierExists = eligible.some(
    (profile) =>
      profile.economicTier !== undefined && profile.economicTier !== "frontier",
  );
  if (!knownLowerTierExists) {
    return Object.freeze({
      competitive: Object.freeze([...eligible]),
      heldBack: Object.freeze([]),
    });
  }

  return Object.freeze({
    competitive: Object.freeze(
      eligible.filter((profile) => profile.economicTier !== "frontier"),
    ),
    heldBack: Object.freeze(
      eligible.filter((profile) => profile.economicTier === "frontier"),
    ),
  });
}

export function pickSmallestCapable(
  profiles: readonly AgentProfile[],
  preferredProviders?: readonly AgentProvider[],
): AgentProfile | null {
  if (profiles.length === 0) return null;

  return [...profiles].sort((a, b) =>
    compareEligibleProfiles(a, b, preferredProviders),
  )[0] ?? null;
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

function isUsableEfficiencySignal(
  signal: Extract<AgentEfficiencySignal, { status: "available" }>,
): boolean {
  return (
    signal.quotaWindowLabel.trim().length > 0 &&
    Number.isFinite(signal.expectedValuePercent) &&
    signal.expectedValuePercent >= 0 &&
    signal.expectedValuePercent <= 100 &&
    Number.isFinite(signal.expectedQuotaConsumedPercent) &&
    signal.expectedQuotaConsumedPercent > 0 &&
    signal.expectedQuotaConsumedPercent <= 100 &&
    Number.isInteger(signal.sampleSize) &&
    signal.sampleSize > 0
  );
}

export function rankAgentProfilesByEfficiency(
  registry: AgentRegistry,
  request: AgentSelectionRequest,
  signals: readonly AgentEfficiencySignal[],
): AgentEfficiencyRankingResult {
  const rejected: AgentRejection[] = [];
  const eligible: AgentProfile[] = [];

  for (const profile of [...registry.profiles].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const evaluation = evaluateAgentProfile(profile, request);
    if (evaluation.ok) eligible.push(profile);
    else rejected.push({ profileId: profile.id, reason: evaluation.reason });
  }

  const signalBuckets = new Map<string, AgentEfficiencySignal[]>();
  for (const signal of signals) {
    const bucket = signalBuckets.get(signal.profileId) ?? [];
    bucket.push(signal);
    signalBuckets.set(signal.profileId, bucket);
  }

  const frontierGate = applyFrontierGate(eligible, request);
  const ranked = frontierGate.competitive.flatMap((profile) => {
    const bucket = signalBuckets.get(profile.id) ?? [];
    if (bucket.length !== 1) return [];
    const signal = bucket[0]!;
    if (signal.status !== "available" || !isUsableEfficiencySignal(signal)) {
      return [];
    }
    return [
      Object.freeze({
        profileId: profile.id,
        quotaWindowLabel: signal.quotaWindowLabel,
        expectedValuePercent: signal.expectedValuePercent,
        expectedQuotaConsumedPercent: signal.expectedQuotaConsumedPercent,
        score:
          signal.expectedValuePercent / signal.expectedQuotaConsumedPercent,
        sampleSize: signal.sampleSize,
      }),
    ];
  });

  const profileById = new Map(eligible.map((profile) => [profile.id, profile]));
  ranked.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const leftProfile = profileById.get(left.profileId)!;
    const rightProfile = profileById.get(right.profileId)!;
    return compareEligibleProfiles(
      leftProfile,
      rightProfile,
      request.preferredProviders,
    );
  });

  const rankedIds = new Set(ranked.map((entry) => entry.profileId));
  const unrankedCompetitive = frontierGate.competitive
    .filter((profile) => !rankedIds.has(profile.id))
    .sort((left, right) =>
      compareEligibleProfiles(left, right, request.preferredProviders),
    )
    .map((profile) => {
      const bucket = signalBuckets.get(profile.id) ?? [];
      const invalid =
        bucket.length > 1 ||
        (bucket.length === 1 &&
          bucket[0]!.status === "available" &&
          !isUsableEfficiencySignal(bucket[0]!));
      return Object.freeze({
        profileId: profile.id,
        reason: invalid
          ? ("invalid_efficiency_signal" as const)
          : ("efficiency_unknown" as const),
      });
    });
  const heldBackFrontier = frontierGate.heldBack
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((profile) =>
      Object.freeze({
        profileId: profile.id,
        reason: "frontier_not_required" as const,
      }),
    );
  const unranked = [...unrankedCompetitive, ...heldBackFrontier];

  return Object.freeze({
    rejected: Object.freeze(rejected),
    ranked: Object.freeze(ranked),
    unranked: Object.freeze(unranked),
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

  const frontierGate = applyFrontierGate(eligible, request);
  const selected = pickSmallestCapable(
    frontierGate.competitive,
    request.preferredProviders,
  );
  if (!selected) return { outcome: "no_match", rejected };
  const heldBackFrontierIds = new Set(
    frontierGate.heldBack.map((profile) => profile.id),
  );

  const selectedFundingModeRank = fundingModeRank(selected);
  const selectedEconomicTierRank = economicTierRank(selected);
  const selectedProviderPreferenceRank = providerPreferenceRank(
    selected,
    request.preferredProviders,
  );
  const notSelected: AgentNonSelection[] = eligible
    .filter((profile) => profile.id !== selected.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((profile) => {
      const profileFundingModeRank = fundingModeRank(profile);
      const profileEconomicTierRank = economicTierRank(profile);
      const profileProviderPreferenceRank = providerPreferenceRank(
        profile,
        request.preferredProviders,
      );
      let reason: AgentNonSelection["reason"];

      if (heldBackFrontierIds.has(profile.id)) {
        reason = "frontier_not_required";
      } else if (profileFundingModeRank > selectedFundingModeRank) {
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
      } else if (
        profileProviderPreferenceRank > selectedProviderPreferenceRank
      ) {
        reason = "less_preferred_provider_than_selected";
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

import type { AgentRegistry } from "./registry.js";
import {
  compareAgentEffort,
  type AgentBudget,
  type AgentCapability,
  type AgentEffort,
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
}>;

export type AgentRejection = Readonly<{
  profileId: string;
  reason: string;
}>;

// Compact audit evidence for profiles that passed every hard gate but lost
// deterministic ranking. It deliberately repeats no profile configuration.
export type AgentNonSelection = Readonly<{
  profileId: string;
  reason: "higher_effort_than_selected" | "deterministic_tiebreak";
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

export function pickSmallestCapable(
  profiles: readonly AgentProfile[],
): AgentProfile | null {
  if (profiles.length === 0) return null;

  return (
    [...profiles].sort(
      (a, b) =>
        compareAgentEffort(a.effort, b.effort) || a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

function canonicalizeSelectedProfile(profile: AgentProfile): AgentProfile {
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze([...new Set(profile.capabilities)].sort()),
    permissions: Object.freeze([...new Set(profile.permissions)].sort()),
    ...(profile.tiers === undefined
      ? {}
      : { tiers: Object.freeze([...new Set(profile.tiers)].sort()) }),
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

  const notSelected: AgentNonSelection[] = eligible
    .filter((profile) => profile.id !== selected.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((profile) => ({
      profileId: profile.id,
      reason:
        compareAgentEffort(profile.effort, selected.effort) > 0
          ? "higher_effort_than_selected"
          : "deterministic_tiebreak",
    }));

  return {
    outcome: "selected",
    profile: canonicalizeSelectedProfile(selected),
    rejected,
    notSelected,
  };
}

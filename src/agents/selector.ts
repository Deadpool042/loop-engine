import type { AgentRegistry } from "./registry.js";
import {
  compareAgentEffort,
  type AgentBudget,
  type AgentCapability,
  type AgentEffort,
  type AgentPermission,
  type AgentProfile,
} from "./types.js";

export type AgentBudgetCeiling = Partial<
  Pick<AgentBudget, "maxTokens" | "maxCostUsd" | "maxDurationMs" | "maxCalls" | "maxRepairs">
>;

export type AgentSelectionRequest = Readonly<{
  requiredCapabilities: readonly AgentCapability[];
  requiredPermissions: readonly AgentPermission[];
  minEffort?: AgentEffort;
  maxEffort?: AgentEffort;
  budgetCeiling?: AgentBudgetCeiling;
}>;

export type AgentRejection = Readonly<{
  profileId: string;
  reason: string;
}>;

export type AgentSelectionResult =
  | Readonly<{ outcome: "selected"; profile: AgentProfile; rejected: readonly AgentRejection[] }>
  | Readonly<{ outcome: "no_match"; rejected: readonly AgentRejection[] }>;

const BUDGET_DIMENSIONS = ["maxTokens", "maxCostUsd", "maxDurationMs", "maxCalls", "maxRepairs"] as const;

function findBudgetViolation(budget: AgentBudget, ceiling: AgentBudgetCeiling): string | null {
  for (const dimension of BUDGET_DIMENSIONS) {
    const ceilingValue = ceiling[dimension];

    if (ceilingValue == null) {
      continue;
    }

    const profileValue = budget[dimension];

    // A profile with no declared bound on this dimension (null) is treated
    // as a violation once the caller sets an explicit ceiling: token
    // economy is a central goal of this lot, so an unknown bound must never
    // silently pass an explicit budget constraint.
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
  const missingCapabilities = request.requiredCapabilities.filter(
    (capability) => !profile.capabilities.includes(capability),
  );

  if (missingCapabilities.length > 0) {
    return { ok: false, reason: `missing capabilities: ${missingCapabilities.join(", ")}` };
  }

  const missingPermissions = request.requiredPermissions.filter(
    (permission) => !profile.permissions.includes(permission),
  );

  if (missingPermissions.length > 0) {
    return { ok: false, reason: `missing permissions: ${missingPermissions.join(", ")}` };
  }

  if (request.minEffort && compareAgentEffort(profile.effort, request.minEffort) < 0) {
    return {
      ok: false,
      reason: `effort ${profile.effort} is below min effort ${request.minEffort}`,
    };
  }

  if (request.maxEffort && compareAgentEffort(profile.effort, request.maxEffort) > 0) {
    return {
      ok: false,
      reason: `effort ${profile.effort} exceeds max effort ${request.maxEffort}`,
    };
  }

  if (request.budgetCeiling) {
    const violation = findBudgetViolation(profile.budget, request.budgetCeiling);

    if (violation) {
      return { ok: false, reason: violation };
    }
  }

  return { ok: true };
}

export function pickSmallestCapable(profiles: readonly AgentProfile[]): AgentProfile | null {
  if (profiles.length === 0) {
    return null;
  }

  return (
    [...profiles].sort(
      (a, b) => compareAgentEffort(a.effort, b.effort) || a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

export function selectAgentProfile(
  registry: AgentRegistry,
  request: AgentSelectionRequest,
): AgentSelectionResult {
  const rejected: AgentRejection[] = [];
  const eligible: AgentProfile[] = [];

  for (const profile of registry.profiles) {
    const evaluation = evaluateAgentProfile(profile, request);

    if (evaluation.ok) {
      eligible.push(profile);
    } else {
      rejected.push({ profileId: profile.id, reason: evaluation.reason });
    }
  }

  const selected = pickSmallestCapable(eligible);

  if (!selected) {
    return { outcome: "no_match", rejected };
  }

  return { outcome: "selected", profile: selected, rejected };
}

// Agent Policy Engine (V7.4) — default budgets, permission ceilings, and
// restrictive-merge helpers. Pure functions, no I/O. See
// docs/architecture/agent-policy-engine.md.

import {
  AGENT_EFFORTS,
  compareAgentEffort,
  type AgentBudget,
  type AgentEffort,
  type AgentPermission,
  type AgentProvider,
  type AgentRuntime,
  UNBOUNDED_AGENT_BUDGET,
} from "../agents/types.js";
import type { AgentPolicy, AgentPolicyMode, ContextBudget } from "./types.js";

// Permission ceiling per mode. Each mode includes every permission of the
// mode before it, plus only the additional permissions required by that mode.
// This mirrors "chaque mode inclut les garanties du mode précédent" from
// docs/architecture/autonomous-loop-runner.md. git_tag is never included
// here: it is never implicit, see AgentPolicy.allowTagCreation and
// resolvePolicy in resolver.ts.
const MODE_PERMISSION_CEILINGS: Readonly<Record<AgentPolicyMode, readonly AgentPermission[]>> = {
  plan: ["read_only"],
  execute: ["read_only", "write_worktree", "shell_exec"],
  commit: ["read_only", "write_worktree", "shell_exec", "git_commit"],
  publish: ["read_only", "write_worktree", "shell_exec", "git_commit", "git_push"],
};

export function getAllowedPermissionsForMode(mode: AgentPolicyMode): readonly AgentPermission[] {
  return MODE_PERMISSION_CEILINGS[mode];
}

// Budget defaults per mode. Only maxCalls/maxRepairs carry real meaning here
// — plan never calls an agent (maxCalls: 0), execute/commit/publish share
// the same conservative single-call default. Callers restrict further via
// mergeBudgetsRestrictively; they can never raise these defaults.
export const DEFAULT_MODE_BUDGETS: Readonly<Record<AgentPolicyMode, AgentBudget>> = {
  plan: { ...UNBOUNDED_AGENT_BUDGET, maxCalls: 0, maxRepairs: 0 },
  execute: { ...UNBOUNDED_AGENT_BUDGET, maxCalls: 1, maxRepairs: 1 },
  commit: { ...UNBOUNDED_AGENT_BUDGET, maxCalls: 1, maxRepairs: 1 },
  publish: { ...UNBOUNDED_AGENT_BUDGET, maxCalls: 1, maxRepairs: 1 },
};

// NOT an executable budget — never authorizes a real agent call. It is only
// ever used to filter candidate agent profiles for the forecast preview
// (see resolvePolicy in resolver.ts): "which profile *would* be compatible
// if this candidate proceeded to real execution", never "how many calls are
// authorized right now". Distinct from DEFAULT_MODE_BUDGETS[mode] on
// purpose: mode "plan" makes zero real agent calls (see
// DEFAULT_MODE_BUDGETS.plan above), but section 9 of the V7.4 brief still
// asks for a forecast of which agent would be selected. Using
// DEFAULT_MODE_BUDGETS.plan (maxCalls: 0) as the selection ceiling would
// make every forecast trivially "no_compatible_agent" — useless as a
// preview. So this simulates mode "execute" for a "plan" forecast, and
// matches the real mode's own default otherwise. The literal "plan mode
// makes 0 calls, ever" guarantee is enforced by the runner's control flow
// never invoking an agent, not by this function's return value.
export function getForecastSelectionBudgetForMode(mode: AgentPolicyMode): AgentBudget {
  return mode === "plan" ? DEFAULT_MODE_BUDGETS.execute : DEFAULT_MODE_BUDGETS[mode];
}

const BUDGET_DIMENSIONS = ["maxTokens", "maxCostUsd", "maxDurationMs", "maxCalls", "maxRepairs"] as const;

// result[dimension] = min(global, requested), treating null as "unbounded"
// (+infinity). Both null stays null. This is the single restrictive-merge
// primitive for budgets: a caller-requested budget can only ever tighten the
// global ceiling, never loosen it — an absent/null requested value defers to
// the global value instead of silently becoming unlimited.
export function mergeBudgetsRestrictively(globalBudget: AgentBudget, requestedBudget: AgentBudget): AgentBudget {
  const result = {} as Record<(typeof BUDGET_DIMENSIONS)[number], number | null>;

  for (const dimension of BUDGET_DIMENSIONS) {
    const globalValue = globalBudget[dimension];
    const requestedValue = requestedBudget[dimension];

    if (globalValue === null) {
      result[dimension] = requestedValue;
    } else if (requestedValue === null) {
      result[dimension] = globalValue;
    } else {
      result[dimension] = Math.min(globalValue, requestedValue);
    }
  }

  return result as AgentBudget;
}

// Normalizes a caller-supplied partial budget (e.g. from n8n) into a full
// AgentBudget, filling every omitted dimension with null ("no additional
// restriction from this side") so it can be passed to
// mergeBudgetsRestrictively without accidentally widening anything.
export function toBudget(partial: Partial<AgentBudget>): AgentBudget {
  return { ...UNBOUNDED_AGENT_BUDGET, ...partial };
}

// Intersection, never union: a caller can only narrow the set of allowed
// providers/runtimes a policy already declares. `undefined` on either side
// means "no restriction from this side" (defers to the other side).
export function mergeAllowedProviders(
  global: readonly AgentProvider[] | undefined,
  requested: readonly AgentProvider[] | undefined,
): readonly AgentProvider[] | undefined {
  if (!global) {
    return requested;
  }

  if (!requested) {
    return global;
  }

  return global.filter((provider) => requested.includes(provider));
}

export function mergeAllowedRuntimes(
  global: readonly AgentRuntime[] | undefined,
  requested: readonly AgentRuntime[] | undefined,
): readonly AgentRuntime[] | undefined {
  if (!global) {
    return requested;
  }

  if (!requested) {
    return global;
  }

  return global.filter((runtime) => requested.includes(runtime));
}

// A requested maximum effort can only lower the global ceiling, never raise
// it: if the request asks for more than the policy allows, the policy wins.
export function restrictMaximumEffort(globalMax: AgentEffort, requestedMax: AgentEffort | undefined): AgentEffort {
  if (!requestedMax) {
    return globalMax;
  }

  return compareAgentEffort(requestedMax, globalMax) <= 0 ? requestedMax : globalMax;
}

// Deterministic, monotonically non-decreasing context budget per effort
// level. Always bounded — no effort level ever produces an unlimited
// context budget. This lot only produces the budget and its rationale; it
// does not build the actual context package (see
// docs/architecture/agent-policy-engine.md, section "Politique de contexte").
const CONTEXT_BUDGET_BY_EFFORT: Readonly<Record<AgentEffort, ContextBudget>> = {
  low: { maxFiles: 3, maxCharacters: 20_000, maxEstimatedTokens: 5_000, includeFullFiles: false },
  medium: { maxFiles: 8, maxCharacters: 60_000, maxEstimatedTokens: 15_000, includeFullFiles: false },
  high: { maxFiles: 20, maxCharacters: 150_000, maxEstimatedTokens: 40_000, includeFullFiles: true },
  xhigh: { maxFiles: 40, maxCharacters: 300_000, maxEstimatedTokens: 80_000, includeFullFiles: true },
  max: { maxFiles: 80, maxCharacters: 600_000, maxEstimatedTokens: 160_000, includeFullFiles: true },
};

export function getContextBudgetForEffort(effort: AgentEffort): ContextBudget {
  return CONTEXT_BUDGET_BY_EFFORT[effort];
}

// A restrictive merge for ContextBudget, same shape as mergeBudgetsRestrictively:
// every numeric dimension takes the minimum, and includeFullFiles is only
// true when both sides allow it.
export function mergeContextBudgetsRestrictively(global: ContextBudget, requested: ContextBudget): ContextBudget {
  return {
    maxFiles: Math.min(global.maxFiles, requested.maxFiles),
    maxCharacters: Math.min(global.maxCharacters, requested.maxCharacters),
    maxEstimatedTokens: Math.min(global.maxEstimatedTokens, requested.maxEstimatedTokens),
    includeFullFiles: global.includeFullFiles && requested.includeFullFiles,
  };
}

// Illustrative default policy — analogous to DEFAULT_AGENT_PROFILES in
// src/agents/registry.ts: a real deployment is expected to replace or
// extend this, not treat it as a verified fact about any provider.
export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  id: "default",
  enabled: true,
  defaultMinimumEffort: AGENT_EFFORTS[0],
  maximumEffort: "high",
  defaultBudget: UNBOUNDED_AGENT_BUDGET,
  contextBudget: CONTEXT_BUDGET_BY_EFFORT.medium,
  allowEscalation: false,
};

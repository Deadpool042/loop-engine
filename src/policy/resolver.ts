// Agent Policy Engine (V7.4) — resolver: turns a planned micro-lot into
// capabilities, permissions, effort bounds, budgets, and an explainable,
// forecast-only agent selection. See docs/architecture/agent-policy-engine.md.
//
// micro-lot -> requirements -> policy -> selection request -> selector
//
// No network call, no provider SDK, no execute mode: selectAgentProfile is
// always a pure lookup against a local AgentRegistry, never an invocation.

import type { AgentRegistry } from "../agents/registry.js";
import { selectAgentProfile } from "../agents/selector.js";
import {
  compareAgentEffort,
  type AgentCapability,
  type AgentPermission,
  type AgentProfileTier,
} from "../agents/types.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import {
  getAllowedPermissionsForMode,
  getForecastSelectionBudgetForMode,
  getExecutionBudgetForMode,
  getContextBudgetForEffort,
  mergeAllowedProviders,
  mergeAllowedRuntimes,
  mergeBudgetsRestrictively,
  restrictMaximumEffort,
  toBudget,
  DEFAULT_MODE_BUDGETS,
} from "./defaults.js";
import type {
  AgentPolicy,
  AgentPolicyFallback,
  AgentPolicyMode,
  AgentPolicyRequest,
  AgentPolicyResolution,
  LoopTaskCategory,
  LoopTaskRequirements,
} from "./types.js";

const NO_FALLBACK: AgentPolicyFallback = Object.freeze({
  active: false,
  reason: null,
});

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

// Keyword matching is deterministic and favors precision over recall (same
// philosophy as src/intelligence/roadmap.ts): an unmatched lot defaults to
// "code" rather than being mis-tagged as something narrower. Checked in this
// fixed order so a title can never match two categories ambiguously.
//
// Only candidate.text is inspected — never candidate.path. A RoadmapCandidate's
// path is the *source roadmap file* it was parsed from (almost always under
// docs/roadmap/...), not the file the lot would touch; matching against it
// would mis-classify nearly every candidate of every project as
// "documentation" just because the roadmap itself lives under docs/.
const DOCUMENTATION_KEYWORDS = [
  "documentation",
  "readme",
  "guide",
  "standard",
  "logging",
];
const TEST_KEYWORDS = ["test", "tests", "coverage"];
const VALIDATION_KEYWORDS = ["validation", "valider", "audit"];
const ARCHITECTURE_KEYWORDS = [
  "architecture",
  "conception",
  "design",
  "adr",
  "stratégie",
  "strategie",
];
const REVIEW_KEYWORDS = ["revue", "review"];

export function classifyLoopTaskCategory(
  candidate: RoadmapCandidate | null,
): LoopTaskCategory {
  if (!candidate) {
    return "none";
  }

  const haystack = candidate.text.toLowerCase();

  if (DOCUMENTATION_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "documentation";
  }

  if (TEST_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "tests";
  }

  if (VALIDATION_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "validation";
  }

  if (ARCHITECTURE_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "architecture";
  }

  if (REVIEW_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "review";
  }

  return "code";
}

const CATEGORY_CAPABILITIES: Readonly<
  Record<LoopTaskCategory, readonly AgentCapability[]>
> = {
  documentation: ["code_edit"],
  code: ["code_edit", "shell_exec", "test_execution"],
  tests: ["code_edit", "test_execution"],
  validation: ["shell_exec", "test_execution"],
  architecture: ["code_edit", "long_context"],
  review: [],
  none: [],
};

// Whether this category's work, if actually executed, would need to write
// to the worktree. Never consulted directly for permission-granting — always
// filtered through the mode ceiling in deriveRequiredPermissions, which is
// what keeps "no write capability in mode plan" true regardless of category.
const CATEGORY_NEEDS_WRITE: Readonly<Record<LoopTaskCategory, boolean>> = {
  documentation: true,
  code: true,
  tests: true,
  validation: false,
  architecture: true,
  review: false,
  none: false,
};

// "high" is reserved for a demonstrated last resort (see
// src/agents/escalation.ts, only reachable after a real prior attempt with a
// failureReason) — never the static default for a category, however
// sensitive. Architecture/security-flavored work defaults to "medium": a
// deliberately more capable/careful profile than routine development, but
// not an automatic maximum-effort escalation.
const CATEGORY_MINIMUM_EFFORT: Readonly<
  Record<LoopTaskCategory, LoopTaskRequirements["minimumEffort"]>
> = {
  documentation: "low",
  code: "medium",
  tests: "medium",
  validation: "low",
  architecture: "medium",
  review: "low",
  none: "low",
};

// Optional provider-independent doctrinal preference per category. This is
// descriptive policy metadata, never a hard selection requirement: concrete
// profile eligibility remains governed only by capabilities, permissions,
// effort and budget. A category absent here has no additional preference.
const CATEGORY_PREFERRED_CAPABILITY_TIER: Readonly<
  Partial<Record<LoopTaskCategory, AgentProfileTier>>
> = {
  architecture: "high_reasoning",
};

export function deriveRequiredPermissions(
  category: LoopTaskCategory,
  mode: AgentPolicyMode,
): readonly AgentPermission[] {
  const ceiling = getAllowedPermissionsForMode(mode);
  const wanted: AgentPermission[] = ["read_only"];

  if (CATEGORY_NEEDS_WRITE[category]) {
    wanted.push("write_worktree", "shell_exec");
  }

  if (mode === "commit" || mode === "publish") {
    wanted.push("git_commit");
  }

  if (mode === "publish") {
    wanted.push("git_push");
  }

  return ceiling.filter((permission) => wanted.includes(permission));
}

export function deriveTaskRequirements(
  candidate: RoadmapCandidate | null,
  mode: AgentPolicyMode,
  policy: AgentPolicy,
): LoopTaskRequirements {
  const category = classifyLoopTaskCategory(candidate);
  const minimumEffort = CATEGORY_MINIMUM_EFFORT[category];
  const preferredCapabilityTier = CATEGORY_PREFERRED_CAPABILITY_TIER[category];
  const rationale: string[] = [
    candidate
      ? `category=${category} derived from candidate text keywords`
      : "category=none: no roadmap candidate available",
    `mode=${mode} -> permission ceiling=[${getAllowedPermissionsForMode(mode).join(", ")}]`,
  ];

  return {
    category,
    mode,
    requiredCapabilities: CATEGORY_CAPABILITIES[category],
    requiredPermissions: deriveRequiredPermissions(category, mode),
    minimumEffort,
    maximumEffort: policy.maximumEffort,
    ...(preferredCapabilityTier === undefined
      ? {}
      : { preferredCapabilityTier }),
    contextBudget: getContextBudgetForEffort(minimumEffort),
    executionBudget: getExecutionBudgetForMode(
      mode,
      policy.allowEscalation,
    ),
    rationale,
  };
}

export type ResolvePolicyInput = Readonly<{
  policy: AgentPolicy;
  registry: AgentRegistry;
  candidate: RoadmapCandidate | null;
  mode: AgentPolicyMode;
  request?: AgentPolicyRequest;
}>;

function resolution(
  policy: AgentPolicy,
  mode: AgentPolicyMode,
  requirements: LoopTaskRequirements,
  status: AgentPolicyResolution["status"],
  reasons: readonly string[],
  selection: AgentPolicyResolution["selection"] = null,
  selectionRequest: AgentPolicyResolution["selectionRequest"] = {
    requiredCapabilities: requirements.requiredCapabilities,
    requiredPermissions: requirements.requiredPermissions,
  },
  fallback: AgentPolicyFallback = NO_FALLBACK,
): AgentPolicyResolution {
  return {
    policyId: policy.id,
    mode,
    status,
    requirements,
    selectionRequest,
    selection,
    reasons,
    fallback,
  };
}

// A fallback is only ever reported alongside a genuine, requirements-
// satisfying selection — never as a substitute for a failed resolution
// (those already carry their own status code). It never influences which
// profile gets selected: selectAgentProfile already ran and picked the
// cheapest requirements-satisfying profile; this only compares that outcome
// against the category's declared preference, purely for explainability.
function resolveFallback(
  requirements: LoopTaskRequirements,
  selection: AgentPolicyResolution["selection"],
): AgentPolicyFallback {
  if (requirements.preferredCapabilityTier === undefined) {
    return NO_FALLBACK;
  }

  if (selection?.outcome !== "selected") {
    return NO_FALLBACK;
  }

  if (selection.profile.tiers?.includes(requirements.preferredCapabilityTier)) {
    return NO_FALLBACK;
  }

  // The selected profile satisfies every hard requirement but does not carry
  // the category's optional doctrinal preference tier. This is a capability
  // fallback, not an escalation and not a requirements violation.
  return { active: true, reason: "preferred_capability_tier_unavailable" };
}

// Pure, deterministic, and never invokes an agent: only ever reads the
// policy and registry passed in, and calls selectAgentProfile — a plain
// lookup — for the forecast preview. Gates are evaluated as early returns,
// in this fixed order, so exactly one status is ever reported per
// resolution: policy_disabled -> no_safe_candidate -> effort_not_supported
// -> provider_not_allowed -> runtime_not_allowed -> permission_denied ->
// budget_exhausted -> no_compatible_agent -> resolved. budget_exhausted is
// checked before attempting selection (see the comment at that check) so an
// exhausted budget is never misreported as an incompatible registry.
export function resolvePolicy(
  input: ResolvePolicyInput,
): AgentPolicyResolution {
  const { policy, registry, candidate, mode, request = {} } = input;

  const requirements = deriveTaskRequirements(candidate, mode, policy);

  if (!policy.enabled) {
    return resolution(policy, mode, requirements, "policy_disabled", [
      `policy "${policy.id}" is disabled`,
    ]);
  }

  if (!candidate || requirements.category === "none") {
    return resolution(policy, mode, requirements, "no_safe_candidate", [
      "no roadmap candidate was available to resolve a policy for",
    ]);
  }

  const maximumEffort = restrictMaximumEffort(
    policy.maximumEffort,
    request.requestedMaxEffort,
  );

  if (compareAgentEffort(requirements.minimumEffort, maximumEffort) > 0) {
    return resolution(policy, mode, requirements, "effort_not_supported", [
      `minimum effort ${requirements.minimumEffort} exceeds allowed maximum ${maximumEffort}`,
    ]);
  }

  const allowedProviders = mergeAllowedProviders(
    policy.allowedProviders,
    request.requestedProviders,
  );

  if (allowedProviders && allowedProviders.length === 0) {
    return resolution(policy, mode, requirements, "provider_not_allowed", [
      "restrictive provider merge left no allowed provider",
    ]);
  }

  const allowedRuntimes = mergeAllowedRuntimes(
    policy.allowedRuntimes,
    request.requestedRuntimes,
  );

  if (allowedRuntimes && allowedRuntimes.length === 0) {
    return resolution(policy, mode, requirements, "runtime_not_allowed", [
      "restrictive runtime merge left no allowed runtime",
    ]);
  }

  const deniedPermissions = policy.deniedPermissions ?? [];
  const deniedByPolicy = requirements.requiredPermissions.filter((permission) =>
    deniedPermissions.includes(permission),
  );

  if (deniedByPolicy.length > 0) {
    return resolution(policy, mode, requirements, "permission_denied", [
      `policy "${policy.id}" denies required permission(s): ${deniedByPolicy.join(", ")}`,
    ]);
  }

  // Uses the forecast selection budget (a compatibility simulation, never an
  // authorization to call anyone) — not requirements.executionBudget (the
  // literal, informational per-mode default, 0 calls for plan). See
  // getForecastSelectionBudgetForMode in defaults.ts for why the forecast
  // preview must not gate on plan's own zero-call budget.
  const budget = mergeBudgetsRestrictively(
    mergeBudgetsRestrictively(
      policy.defaultBudget,
      getForecastSelectionBudgetForMode(
        mode,
        policy.allowEscalation,
      ),
    ),
    toBudget(request.requestedBudget ?? {}),
  );

  // Checked before selection, not after: once a real mode's own merged
  // budget allows zero calls, every profile will trivially fail the
  // selector's own budget check (every real profile needs at least one
  // call). Reporting that as "no_compatible_agent" would bury the actual
  // cause — an exhausted budget, not an incompatible registry — behind a
  // misleading status.
  if (mode !== "plan" && budget.maxCalls === 0) {
    return resolution(policy, mode, requirements, "budget_exhausted", [
      `merged budget allows 0 agent calls in mode ${mode}`,
    ]);
  }

  const selectionRequest = {
    requiredCapabilities: sortedUnique(requirements.requiredCapabilities),
    requiredPermissions: sortedUnique(requirements.requiredPermissions),
    minEffort: requirements.minimumEffort,
    maxEffort: maximumEffort,
    ...(allowedProviders === undefined
      ? {}
      : { allowedProviders: sortedUnique(allowedProviders) }),
    ...(allowedRuntimes === undefined
      ? {}
      : { allowedRuntimes: sortedUnique(allowedRuntimes) }),
    budgetCeiling: {
      maxTokens: budget.maxTokens,
      maxCostUsd: budget.maxCostUsd,
      maxDurationMs: budget.maxDurationMs,
      maxCalls: budget.maxCalls,
      maxRepairs: budget.maxRepairs,
    },
  };

  // Always computed, even in mode "plan": this is the forecast/preview
  // described in section 9 of the V7.4 brief — it answers "which agent
  // profile would be selected", never "call that agent".
  const selection = selectAgentProfile(registry, selectionRequest);

  if (selection.outcome === "no_match") {
    return resolution(
      policy,
      mode,
      requirements,
      "no_compatible_agent",
      [
        "no registered agent profile satisfies the resolved requirements",
        ...selection.rejected.map((r) => `${r.profileId}: ${r.reason}`),
      ],
      selection,
      selectionRequest,
    );
  }

  const fallback = resolveFallback(requirements, selection);
  const reasons = [
    `selected agent profile "${selection.profile.id}" (effort ${selection.profile.effort}) as a forecast preview`,
    mode === "plan"
      ? `mode plan never calls an agent (this run's own budget.maxCalls is ${String(requirements.executionBudget.maxCalls)} by design); forecast simulated as mode execute`
      : `merged budget allows ${String(budget.maxCalls)} call(s) in mode ${mode}`,
    ...(fallback.active
      ? [
          `fallback: preferred capability tier "${requirements.preferredCapabilityTier}" is unavailable; resolved to the best compatible profile "${selection.profile.id}" instead`,
        ]
      : []),
    ...(selection.notSelected ?? []).map(
      (candidate) =>
        `eligible profile "${candidate.profileId}" not selected: ${candidate.reason}`,
    ),
  ];

  return resolution(
    policy,
    mode,
    requirements,
    "resolved",
    reasons,
    selection,
    selectionRequest,
    fallback,
  );
}

// Agent Policy Engine (V7.4) — local, deterministic types only.
// No network calls, no provider SDK, no execute mode. See
// docs/architecture/agent-policy-engine.md.
//
// Dependency direction: src/policy/ may depend on src/agents/ (consumes the
// selector/registry vocabulary) and, read-only, on src/intelligence/roadmap.js
// (the RoadmapCandidate type — the same dependency src/loop/types.ts already
// has). src/policy/ never depends on src/loop/, src/commands/, or
// src/cli.ts: the LoopRunner consumes this module, never the reverse.

import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentFundingMode,
  AgentPermission,
  AgentProfileTier,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type {
  AgentSelectionRequest,
  AgentSelectionResult,
} from "../agents/selector.js";

// Mirrors LoopRunMode (src/loop/types.ts) structurally without importing it,
// so src/policy/ stays independent of src/loop/. Both unions must be kept in
// sync by hand; a mismatch would surface immediately as a type error at the
// single call site in src/loop/runner.ts.
export const AGENT_POLICY_MODES = [
  "plan",
  "execute",
  "commit",
  "publish",
] as const;

export type AgentPolicyMode = (typeof AGENT_POLICY_MODES)[number];

export const LOOP_TASK_CATEGORIES = [
  "documentation",
  "code",
  "tests",
  "validation",
  "architecture",
  "review",
  "none",
] as const;

export type LoopTaskCategory = (typeof LOOP_TASK_CATEGORIES)[number];

export const LOOP_TASK_TOOLS = [
  "filesystem_read",
  "filesystem_write",
  "shell_exec",
  "test_runner",
] as const;

export type LoopTaskTool = (typeof LOOP_TASK_TOOLS)[number];

export const LOOP_TASK_SCOPES = ["none", "read_only", "bounded_write"] as const;

export type LoopTaskScope = (typeof LOOP_TASK_SCOPES)[number];

export const LOOP_TASK_COMPLEXITIES = ["low", "medium", "high"] as const;

export type LoopTaskComplexity = (typeof LOOP_TASK_COMPLEXITIES)[number];

export type ContextBudget = Readonly<{
  maxFiles: number;
  maxCharacters: number;
  maxEstimatedTokens: number;
  includeFullFiles: boolean;
}>;

export type QuotaReservePolicy = Readonly<{
  repairPercent: number;
  ciPercent: number;
  emergencyPercent: number;
}>;

export type LoopTaskRequirements = Readonly<{
  category: LoopTaskCategory;
  mode: AgentPolicyMode;
  requiredCapabilities: readonly AgentCapability[];
  requiredTools: readonly LoopTaskTool[];
  scope: LoopTaskScope;
  complexity: LoopTaskComplexity;
  requiredPermissions: readonly AgentPermission[];
  minimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  preferredProviders?: readonly AgentProvider[];
  // Optional doctrinal preference tier for this category. This is
  // provider-independent and never gates selection: hard requirements remain
  // capabilities/permissions/effort/budget only.
  preferredCapabilityTier?: AgentProfileTier;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  contextBudget: ContextBudget;
  executionBudget: AgentBudget;
  rationale: readonly string[];
}>;

export type AgentPolicy = Readonly<{
  id: string;
  enabled: boolean;
  defaultMinimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  defaultBudget: AgentBudget;
  contextBudget: ContextBudget;
  quotaReserve?: QuotaReservePolicy;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  /** Deterministic ranking preference only; never widens allowed runtimes. */
  preferredRuntimes?: readonly AgentRuntime[];
  // Paid funding modes are never implicitly authorized. When omitted, the
  // resolver falls back to the safe included/unknown set from defaults.ts.
  allowedFundingModes?: readonly AgentFundingMode[];
  deniedPermissions?: readonly AgentPermission[];
  // Never grants git_tag implicitly (see AGENT_PERMISSIONS in
  // src/agents/types.ts). Only consulted in mode "publish"; false by default.
  allowTagCreation?: boolean;
  allowEscalation: boolean;
}>;

// Caller-supplied (e.g. n8n) request to narrow a resolution. Every field is
// optional and can only ever *restrict* what the policy already allows —
// see mergeBudgetsRestrictively/mergeAllowedProviders/mergeAllowedRuntimes/
// restrictMaximumEffort in defaults.ts. None of these fields can widen a
// policy's global ceiling.
export type AgentPolicyRequest = Readonly<{
  requestedBudget?: Partial<AgentBudget>;
  requestedMaxEffort?: AgentEffort;
  requestedProviders?: readonly AgentProvider[];
  requestedRuntimes?: readonly AgentRuntime[];
  requestedFundingModes?: readonly AgentFundingMode[];
}>;

export const AGENT_POLICY_STATUS_CODES = [
  "resolved",
  "no_safe_candidate",
  "no_compatible_agent",
  "policy_disabled",
  "permission_denied",
  "budget_exhausted",
  "effort_not_supported",
  "provider_not_allowed",
  "runtime_not_allowed",
] as const;

export type AgentPolicyStatusCode = (typeof AGENT_POLICY_STATUS_CODES)[number];

export const AGENT_POLICY_FALLBACK_REASONS = [
  "preferred_capability_tier_unavailable",
] as const;

export type AgentPolicyFallbackReason =
  (typeof AGENT_POLICY_FALLBACK_REASONS)[number];

// Reports whether the resolved selection fully satisfies the category's
// optional doctrinal capability preference or uses a compatible fallback.
// A fallback is never a requirements violation — the selected profile still
// satisfies every required capability/permission/budget; it just is not the
// preferred one, typically because that preferred profile is not yet
// registered/priced (see docs/architecture/agent-policy-engine.md). Distinct
// from escalation (src/agents/escalation.ts): a fallback reflects
// unavailable preference at resolution time, never a real failed attempt.
export type AgentPolicyFallback = Readonly<{
  active: boolean;
  reason: AgentPolicyFallbackReason | null;
}>;

export type AgentPolicyResolution = Readonly<{
  policyId: string;
  mode: AgentPolicyMode;
  status: AgentPolicyStatusCode;
  requirements: LoopTaskRequirements;
  selectionRequest: AgentSelectionRequest;
  // Always computed when a selection was attempted, even in mode "plan" —
  // this is the forecast/preview described in
  // docs/architecture/agent-policy-engine.md. Never used to invoke an agent.
  selection: AgentSelectionResult | null;
  reasons: readonly string[];
  fallback: AgentPolicyFallback;
}>;

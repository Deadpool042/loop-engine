// Agent orchestration layer (V7.3) — local, deterministic types only.
// No network calls, no provider SDK, no execute mode. See
// docs/architecture/agent-orchestration.md.

export const AGENT_RUNTIMES = [
  "claude_code",
  "codex",
  "openclaw",
  "chatgpt",
  "copilot",
  "gemini_cli",
  "custom",
] as const;

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export const AGENT_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "github",
  "local",
] as const;

export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_CAPABILITIES = [
  "code_edit",
  "shell_exec",
  "network_access",
  "web_search",
  "long_context",
  "vision",
  "multi_file_refactor",
  "test_execution",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export const AGENT_PROFILE_TIERS = ["high_reasoning"] as const;

export type AgentProfileTier = (typeof AGENT_PROFILE_TIERS)[number];

// git_tag is deliberately separate from git_push: creating a tag is never an
// implicit consequence of a permission that allows pushing a branch. See
// docs/architecture/agent-policy-engine.md.
export const AGENT_PERMISSIONS = [
  "read_only",
  "write_worktree",
  "network_access",
  "shell_exec",
  "git_commit",
  "git_push",
  "git_tag",
] as const;

export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

// Ordered from least to most expensive/capable. This order is the single
// source of truth for "smallest capable agent first" and for escalation —
// never re-derive an ordering from string comparison or array position
// elsewhere.
export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type AgentEffort = (typeof AGENT_EFFORTS)[number];

export const AGENT_ECONOMIC_TIERS = [
  "economy",
  "standard",
  "advanced",
  "frontier",
] as const;

export type AgentEconomicTier = (typeof AGENT_ECONOMIC_TIERS)[number];

export function agentEconomicTierRank(tier: AgentEconomicTier): number {
  return AGENT_ECONOMIC_TIERS.indexOf(tier);
}

export const AGENT_AVAILABILITY_STATES = [
  "available",
  "unavailable",
] as const;

export type AgentAvailabilityState =
  (typeof AGENT_AVAILABILITY_STATES)[number];

export const AGENT_FUNDING_MODES = [
  "included_subscription",
  "additional_credits",
  "metered_api",
  "unknown",
] as const;

export type AgentFundingMode = (typeof AGENT_FUNDING_MODES)[number];

export function agentFundingModeRank(mode: AgentFundingMode): number {
  return AGENT_FUNDING_MODES.indexOf(mode);
}

export const AGENT_QUOTA_STATES = [
  "available",
  "exhausted",
  "unknown",
] as const;

export type AgentQuotaState = (typeof AGENT_QUOTA_STATES)[number];

export const AGENT_QUOTA_SOURCES = [
  "runtime_report",
  "operator_assertion",
  "unavailable",
] as const;

export type AgentQuotaSource = (typeof AGENT_QUOTA_SOURCES)[number];

export type AgentQuotaSnapshot = Readonly<{
  state: AgentQuotaState;
  source: AgentQuotaSource;
}>;

export function agentEffortRank(effort: AgentEffort): number {
  return AGENT_EFFORTS.indexOf(effort);
}

export function compareAgentEffort(a: AgentEffort, b: AgentEffort): number {
  return agentEffortRank(a) - agentEffortRank(b);
}

// null means "unbounded" — no limit declared for that dimension.
export type AgentBudget = Readonly<{
  maxTokens: number | null;
  maxCostUsd: number | null;
  maxDurationMs: number | null;
  maxCalls: number | null;
  maxRepairs: number | null;
}>;

export const UNBOUNDED_AGENT_BUDGET: AgentBudget = Object.freeze({
  maxTokens: null,
  maxCostUsd: null,
  maxDurationMs: null,
  maxCalls: null,
  maxRepairs: null,
});

export type AgentProfile = Readonly<{
  id: string;
  runtime: AgentRuntime;
  provider: AgentProvider;
  // Free-form on purpose: model identifiers change too often to be a fixed
  // union. Typing lives on runtime/provider/capabilities/permissions/effort,
  // never on the list of possible model strings.
  model: string;
  effort: AgentEffort;
  // Optional portfolio metadata. Economic tier is deliberately separate from
  // invocation effort; V48.3 may rank on it only after hard admission gates.
  economicTier?: AgentEconomicTier;
  // Funding is explicit configuration evidence. Undefined is treated as
  // "unknown" and is never silently assumed to be free or paid.
  fundingMode?: AgentFundingMode;
  // Optional quota evidence. Undefined is equivalent to an unknown quota.
  // No percentage or remaining count is inferred by Loop Engine.
  quota?: AgentQuotaSnapshot;
  // Undefined remains backwards-compatible with "available". An explicit
  // unavailable state is a hard admission signal, never a silent alias.
  availability?: AgentAvailabilityState;
  capabilities: readonly AgentCapability[];
  // Optional descriptive tiers used by policy preferences only.
  // They never grant capabilities or permissions and never affect selector
  // eligibility/ranking unless a higher layer explicitly inspects them.
  tiers?: readonly AgentProfileTier[];
  permissions: readonly AgentPermission[];
  budget: AgentBudget;
}>;

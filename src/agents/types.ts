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

export const AGENT_PROVIDERS = ["anthropic", "openai", "google", "github", "local"] as const;

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

export const AGENT_PERMISSIONS = [
  "read_only",
  "write_worktree",
  "network_access",
  "shell_exec",
  "git_commit",
  "git_push",
] as const;

export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

// Ordered from least to most expensive/capable. This order is the single
// source of truth for "smallest capable agent first" and for escalation —
// never re-derive an ordering from string comparison or array position
// elsewhere.
export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type AgentEffort = (typeof AGENT_EFFORTS)[number];

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
  capabilities: readonly AgentCapability[];
  permissions: readonly AgentPermission[];
  budget: AgentBudget;
}>;

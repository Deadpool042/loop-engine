import type { AgentProfile } from "./types.js";

export type AgentRegistry = Readonly<{
  profiles: readonly AgentProfile[];
}>;

export function createAgentRegistry(
  profiles: readonly AgentProfile[],
): AgentRegistry {
  const seen = new Set<string>();

  for (const profile of profiles) {
    if (seen.has(profile.id)) {
      throw new Error(`Duplicate agent profile id: ${profile.id}`);
    }

    seen.add(profile.id);
  }

  return { profiles };
}

export function findAgentProfile(
  registry: AgentRegistry,
  id: string,
): AgentProfile | null {
  return registry.profiles.find((profile) => profile.id === id) ?? null;
}

// Illustrative example profiles only. Runtime/provider identities are real,
// but the capabilities/permissions/budget values below are placeholder
// configuration to exercise the selector and escalation strategy in this
// lot — they are not verified claims about what each third-party tool can
// actually do. Replace or extend with verified data before any real
// integration.
export const DEFAULT_AGENT_PROFILES: readonly AgentProfile[] = [
  {
    id: "claude_code.low",
    runtime: "claude_code",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    effort: "low",
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: 50_000,
      maxCostUsd: 1,
      maxDurationMs: 120_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
  },
  {
    id: "claude_code.high",
    runtime: "claude_code",
    provider: "anthropic",
    model: "claude-sonnet-5",
    effort: "high",
    capabilities: [
      "code_edit",
      "shell_exec",
      "test_execution",
      "multi_file_refactor",
      "long_context",
    ],
    permissions: ["read_only", "write_worktree", "shell_exec", "git_commit"],
    budget: {
      maxTokens: 400_000,
      maxCostUsd: 10,
      maxDurationMs: 900_000,
      maxCalls: 3,
      maxRepairs: 2,
    },
  },
  {
    id: "codex.medium",
    runtime: "codex",
    provider: "openai",
    model: "gpt-5-codex",
    effort: "medium",
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: 150_000,
      maxCostUsd: 4,
      maxDurationMs: 300_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
  },
  {
    id: "openclaw.medium",
    runtime: "openclaw",
    provider: "local",
    model: "openclaw-default",
    effort: "medium",
    capabilities: ["code_edit", "shell_exec"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: 300_000,
      maxCalls: 2,
      maxRepairs: 1,
    },
  },
  {
    id: "copilot.low",
    runtime: "copilot",
    provider: "github",
    model: "copilot-default",
    effort: "low",
    capabilities: ["code_edit"],
    permissions: ["read_only", "write_worktree"],
    budget: {
      maxTokens: 40_000,
      maxCostUsd: 1,
      maxDurationMs: 120_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
  },
  {
    id: "gemini_cli.medium",
    runtime: "gemini_cli",
    provider: "google",
    model: "gemini-2.5-pro",
    effort: "medium",
    capabilities: ["code_edit", "long_context", "web_search"],
    permissions: ["read_only", "write_worktree"],
    budget: {
      maxTokens: 200_000,
      maxCostUsd: 3,
      maxDurationMs: 300_000,
      maxCalls: 2,
      maxRepairs: 1,
    },
  },
];

export const defaultAgentRegistry: AgentRegistry = createAgentRegistry(
  DEFAULT_AGENT_PROFILES,
);

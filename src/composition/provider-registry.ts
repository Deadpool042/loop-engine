import {
  createAgentRegistry,
  type AgentRegistry,
} from "../agents/registry.js";
import type {
  AgentCapability,
  AgentPermission,
  AgentProfile,
} from "../agents/types.js";
import type { LoopExecutor } from "../core/index.js";
import { createClaudeCodeCliLoopExecutor } from "../loop/claude-code-cli-executor.js";
import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";
import { ANTHROPIC_HAIKU_4_5_MODEL } from "../text-only-provider/pricing.js";

export const LOOP_PROVIDER_IDS = ["codex", "claude_code"] as const;
export type LoopProviderId = (typeof LOOP_PROVIDER_IDS)[number];

const DEFAULT_CODEX_MODEL = "gpt-5.6-luna";

// This is the conservative capability envelope of the concrete Loop Engine
// CLI integrations, not a model/provider capability catalog. It deliberately
// contains only capabilities required by the normal code/test execution path
// that both concrete executors expose through an isolated writable worktree.
// Richer capabilities must be declared explicitly by a future verified
// integration instead of being inferred from an illustrative model profile.
const EXECUTABLE_PROVIDER_CAPABILITIES: readonly AgentCapability[] =
  Object.freeze(["code_edit", "shell_exec", "test_execution"]);

const EXECUTABLE_PROVIDER_PERMISSIONS: readonly AgentPermission[] =
  Object.freeze(["read_only", "write_worktree", "shell_exec"]);

export type CodexProviderConfiguration = Readonly<{
  id: "codex";
  executable: string;
  model?: string;
  timeoutMs?: number;
}>;

export type ClaudeCodeProviderConfiguration = Readonly<{
  id: "claude_code";
  executable: string;
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
}>;

export type LoopProviderConfiguration =
  | CodexProviderConfiguration
  | ClaudeCodeProviderConfiguration;

export type LoopProviderAssembly = Readonly<{
  id: LoopProviderId;
  executor: LoopExecutor;
  agentRegistry: AgentRegistry;
}>;

export type LoopProviderRegistration = Readonly<{
  id: LoopProviderId;
  assemble: (configuration: LoopProviderConfiguration) => LoopProviderAssembly;
}>;

export type LoopProviderRegistry = Readonly<{
  registrations: readonly LoopProviderRegistration[];
}>;

function configuredProfile(
  configuration: LoopProviderConfiguration,
): AgentProfile {
  const isCodex = configuration.id === "codex";

  // A configured execution profile is derived only from the concrete provider
  // registration and its explicit configuration. In particular, it never
  // copies capabilities, permissions, effort, or budgets from
  // DEFAULT_AGENT_PROFILES/defaultAgentRegistry, which are forecast examples.
  return Object.freeze({
    id: `configured.${configuration.id}`,
    runtime: isCodex ? "codex" : "claude_code",
    provider: isCodex ? "openai" : "anthropic",
    model:
      configuration.model ??
      (isCodex ? DEFAULT_CODEX_MODEL : ANTHROPIC_HAIKU_4_5_MODEL),
    // A provider-bound registry contains one executable profile per configured
    // provider. Profile effort is therefore only a deterministic ranking
    // baseline; invocation effort remains policy.requirements.minimumEffort.
    effort: "low",
    capabilities: EXECUTABLE_PROVIDER_CAPABILITIES,
    permissions: EXECUTABLE_PROVIDER_PERMISSIONS,
    budget: Object.freeze({
      // The CLI executors do not enforce token or monetary ceilings. Reporting
      // invented values here would make policy admission appear stricter than
      // the executable boundary really is.
      maxTokens: null,
      maxCostUsd: null,
      // Only an explicitly configured timeout is reflected here. If no timeout
      // is provided, the executor owns its internal default and the registry
      // does not pretend to know an independently enforced policy ceiling.
      maxDurationMs: configuration.timeoutMs ?? null,
      maxCalls: 1,
      maxRepairs: 1,
    }),
  });
}

export const codexProviderRegistration: LoopProviderRegistration = Object.freeze({
  id: "codex",
  assemble(configuration): LoopProviderAssembly {
    if (configuration.id !== "codex") {
      throw new TypeError(
        "Codex registration received another provider configuration.",
      );
    }
    const executor = createCodexCliLoopExecutor({
      executable: configuration.executable,
      ...(configuration.model ? { model: configuration.model } : {}),
      ...(configuration.timeoutMs ? { timeoutMs: configuration.timeoutMs } : {}),
    });
    return Object.freeze({
      id: "codex",
      executor,
      agentRegistry: createAgentRegistry([configuredProfile(configuration)]),
    });
  },
});

export const claudeCodeProviderRegistration: LoopProviderRegistration =
  Object.freeze({
    id: "claude_code",
    assemble(configuration): LoopProviderAssembly {
      if (configuration.id !== "claude_code") {
        throw new TypeError(
          "Claude Code registration received another provider configuration.",
        );
      }
      const executor = createClaudeCodeCliLoopExecutor({
        executable: configuration.executable,
        ...(configuration.model ? { model: configuration.model } : {}),
        ...(configuration.timeoutMs ? { timeoutMs: configuration.timeoutMs } : {}),
        ...(configuration.maxTurns ? { maxTurns: configuration.maxTurns } : {}),
      });
      return Object.freeze({
        id: "claude_code",
        executor,
        agentRegistry: createAgentRegistry([configuredProfile(configuration)]),
      });
    },
  });

export function createLoopProviderRegistry(
  registrations: readonly LoopProviderRegistration[],
): LoopProviderRegistry {
  const seen = new Set<LoopProviderId>();
  for (const registration of registrations) {
    if (seen.has(registration.id)) {
      throw new Error(`Duplicate provider registration: ${registration.id}`);
    }
    seen.add(registration.id);
  }
  return Object.freeze({ registrations: Object.freeze([...registrations]) });
}

export const defaultLoopProviderRegistry = createLoopProviderRegistry([
  codexProviderRegistration,
  claudeCodeProviderRegistration,
]);

export function assembleLoopProvider(
  registry: LoopProviderRegistry,
  configuration: LoopProviderConfiguration,
): LoopProviderAssembly {
  const registration = registry.registrations.find(
    (candidate) => candidate.id === configuration.id,
  );
  if (!registration) {
    throw new Error(`Provider is not registered: ${configuration.id}`);
  }
  const assembly = registration.assemble(configuration);
  if (assembly.id !== registration.id) {
    throw new Error(
      `Provider registration ${registration.id} returned assembly ${assembly.id}.`,
    );
  }
  return assembly;
}

export function assembleLoopProviders(
  registry: LoopProviderRegistry,
  configurations: readonly LoopProviderConfiguration[],
): readonly LoopProviderAssembly[] {
  if (configurations.length === 0) {
    throw new TypeError("At least one provider configuration is required.");
  }
  const ids = configurations.map((configuration) => configuration.id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Provider configurations must use unique ids.");
  }
  return Object.freeze(
    configurations.map((configuration) =>
      assembleLoopProvider(registry, configuration),
    ),
  );
}

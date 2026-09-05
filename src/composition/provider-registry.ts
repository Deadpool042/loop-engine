import {
  createAgentRegistry,
  type AgentRegistry,
} from "../agents/registry.js";
import type {
  AgentAvailabilityState,
  AgentCapability,
  AgentEconomicTier,
  AgentEffort,
  AgentFundingMode,
  AgentPermission,
  AgentProfile,
  AgentQuotaSnapshot,
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
// Richer capabilities must be declared explicitly by a verified integration
// contract instead of being inferred from an illustrative model profile.
const EXECUTABLE_PROVIDER_CAPABILITIES: readonly AgentCapability[] =
  Object.freeze(["code_edit", "shell_exec", "test_execution"]);

const EXECUTABLE_PROVIDER_PERMISSIONS: readonly AgentPermission[] =
  Object.freeze(["read_only", "write_worktree", "shell_exec"]);

export type LoopProviderModelProfileConfiguration = Readonly<{
  id: string;
  model: string;
  economicTier: AgentEconomicTier;
  availability?: AgentAvailabilityState;
  fundingMode?: AgentFundingMode;
  quota?: AgentQuotaSnapshot;
  // Ranking baseline only. Invocation effort is still resolved by policy.
  effort?: AgentEffort;
  // Capabilities are explicit configuration evidence, not inferred from the
  // commercial model name.
  capabilities: readonly AgentCapability[];
}>;

export type CodexProviderConfiguration = Readonly<{
  id: "codex";
  executable: string;
  model?: string;
  profiles?: readonly LoopProviderModelProfileConfiguration[];
  fundingMode?: AgentFundingMode;
  quota?: AgentQuotaSnapshot;
  timeoutMs?: number;
}>;

export type ClaudeCodeProviderConfiguration = Readonly<{
  id: "claude_code";
  executable: string;
  model?: string;
  profiles?: readonly LoopProviderModelProfileConfiguration[];
  fundingMode?: AgentFundingMode;
  quota?: AgentQuotaSnapshot;
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

function configuredModel(configuration: LoopProviderConfiguration): string {
  if (configuration.model) return configuration.model;
  return configuration.id === "codex"
    ? DEFAULT_CODEX_MODEL
    : ANTHROPIC_HAIKU_4_5_MODEL;
}

function configuredBudget(
  configuration: LoopProviderConfiguration,
): AgentProfile["budget"] {
  return Object.freeze({
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
  });
}

function validateConfiguredProfiles(
  configuration: LoopProviderConfiguration,
): readonly LoopProviderModelProfileConfiguration[] | null {
  if (configuration.model && configuration.profiles !== undefined) {
    throw new TypeError(
      "Provider configuration must use either model or profiles, not both.",
    );
  }
  if (configuration.profiles === undefined) return null;
  if (configuration.profiles.length === 0) {
    throw new TypeError("Configured provider profiles must not be empty.");
  }

  const ids = new Set<string>();
  for (const profile of configuration.profiles) {
    const id = profile.id.trim();
    const model = profile.model.trim();
    if (id.length === 0 || model.length === 0) {
      throw new TypeError(
        "Configured provider profiles require non-empty id and model values.",
      );
    }
    if (ids.has(id)) {
      throw new TypeError(`Duplicate configured provider profile id: ${id}`);
    }
    ids.add(id);

    const missingBaseCapabilities = EXECUTABLE_PROVIDER_CAPABILITIES.filter(
      (capability) => !profile.capabilities.includes(capability),
    );
    if (missingBaseCapabilities.length > 0) {
      throw new TypeError(
        `Configured provider profile ${id} is missing executable capabilities: ${missingBaseCapabilities.join(", ")}`,
      );
    }
  }

  return configuration.profiles;
}

function configuredProfiles(
  configuration: LoopProviderConfiguration,
): readonly AgentProfile[] {
  const isCodex = configuration.id === "codex";
  const runtime = isCodex ? "codex" : "claude_code";
  const provider = isCodex ? "openai" : "anthropic";
  const configured = validateConfiguredProfiles(configuration);

  if (configured !== null) {
    return Object.freeze(
      configured.map((profile) =>
        Object.freeze({
          id: `configured.${configuration.id}.${profile.id.trim()}`,
          runtime,
          provider,
          model: profile.model.trim(),
          effort: profile.effort ?? "low",
          economicTier: profile.economicTier,
          availability: profile.availability ?? "available",
          ...(profile.fundingMode === undefined
            ? {}
            : { fundingMode: profile.fundingMode }),
          ...(profile.quota === undefined
            ? {}
            : { quota: Object.freeze({ ...profile.quota }) }),
          capabilities: Object.freeze([
            ...new Set(profile.capabilities),
          ]),
          permissions: EXECUTABLE_PROVIDER_PERMISSIONS,
          budget: configuredBudget(configuration),
        }),
      ),
    );
  }

  // Backwards-compatible single-model configuration. It remains deliberately
  // conservative: commercial model names never grant extra capabilities.
  return Object.freeze([
    Object.freeze({
      id: `configured.${configuration.id}`,
      runtime,
      provider,
      model: configuredModel(configuration),
      effort: "low",
      availability: "available",
      ...(configuration.fundingMode === undefined
        ? {}
        : { fundingMode: configuration.fundingMode }),
      ...(configuration.quota === undefined
        ? {}
        : { quota: Object.freeze({ ...configuration.quota }) }),
      capabilities: EXECUTABLE_PROVIDER_CAPABILITIES,
      permissions: EXECUTABLE_PROVIDER_PERMISSIONS,
      budget: configuredBudget(configuration),
    }),
  ]);
}

export const codexProviderRegistration: LoopProviderRegistration = Object.freeze({
  id: "codex",
  assemble(configuration): LoopProviderAssembly {
    if (configuration.id !== "codex") {
      throw new TypeError(
        "Codex registration received another provider configuration.",
      );
    }
    const profiles = configuredProfiles(configuration);
    const executor = createCodexCliLoopExecutor({
      executable: configuration.executable,
      ...(configuration.profiles === undefined && configuration.model
        ? { model: configuration.model }
        : {}),
      ...(configuration.timeoutMs ? { timeoutMs: configuration.timeoutMs } : {}),
    });
    return Object.freeze({
      id: "codex",
      executor,
      agentRegistry: createAgentRegistry(profiles),
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
      const profiles = configuredProfiles(configuration);
      const executor = createClaudeCodeCliLoopExecutor({
        executable: configuration.executable,
        ...(configuration.profiles === undefined && configuration.model
          ? { model: configuration.model }
          : {}),
        ...(configuration.timeoutMs ? { timeoutMs: configuration.timeoutMs } : {}),
        ...(configuration.maxTurns ? { maxTurns: configuration.maxTurns } : {}),
      });
      return Object.freeze({
        id: "claude_code",
        executor,
        agentRegistry: createAgentRegistry(profiles),
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

import {
  createAgentRegistry,
  defaultAgentRegistry,
  type AgentRegistry,
} from "../agents/registry.js";
import type { AgentProfile } from "../agents/types.js";
import type { LoopExecutor } from "../core/index.js";
import { createClaudeCodeCliLoopExecutor } from "../loop/claude-code-cli-executor.js";
import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";

export const LOOP_PROVIDER_IDS = ["codex", "claude_code"] as const;
export type LoopProviderId = (typeof LOOP_PROVIDER_IDS)[number];

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
  const expected =
    configuration.id === "codex"
      ? { runtime: "codex", provider: "openai" }
      : { runtime: "claude_code", provider: "anthropic" };
  const candidates = defaultAgentRegistry.profiles.filter(
    (profile) =>
      profile.runtime === expected.runtime && profile.provider === expected.provider,
  );
  // A configured model may be an enterprise alias unknown to the local
  // recommendation catalog. Preserve that supported configuration while using
  // the provider's conservative baseline capabilities for policy admission.
  const defaultProfile =
    (configuration.model === undefined
      ? candidates[0]
      : candidates.find((profile) => profile.model === configuration.model) ??
        candidates.find((profile) => profile.effort === "medium") ??
        candidates[0]) ??
    null;
  if (!defaultProfile) {
    throw new Error(`No ${configuration.id} agent profile is registered.`);
  }
  return Object.freeze({
    ...defaultProfile,
    id: `configured.${configuration.id}`,
    model: configuration.model ?? defaultProfile.model,
    capabilities: Object.freeze([...defaultProfile.capabilities]),
    permissions: Object.freeze([...defaultProfile.permissions]),
    budget: Object.freeze({ ...defaultProfile.budget }),
  });
}

export const codexProviderRegistration: LoopProviderRegistration = Object.freeze({
  id: "codex",
  assemble(configuration): LoopProviderAssembly {
    if (configuration.id !== "codex") {
      throw new TypeError("Codex registration received another provider configuration.");
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

export const claudeCodeProviderRegistration: LoopProviderRegistration = Object.freeze({
  id: "claude_code",
  assemble(configuration): LoopProviderAssembly {
    if (configuration.id !== "claude_code") {
      throw new TypeError("Claude Code registration received another provider configuration.");
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

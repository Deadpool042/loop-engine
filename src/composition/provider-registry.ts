import {
  createAgentRegistry,
  defaultAgentRegistry,
  type AgentRegistry,
} from "../agents/registry.js";
import type { AgentProfile } from "../agents/types.js";
import type { LoopExecutor } from "../core/index.js";
import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";

export const LOOP_PROVIDER_IDS = ["codex"] as const;
export type LoopProviderId = (typeof LOOP_PROVIDER_IDS)[number];

export type CodexProviderConfiguration = Readonly<{
  id: "codex";
  executable: string;
  model?: string;
  timeoutMs?: number;
}>;

export type LoopProviderConfiguration = CodexProviderConfiguration;

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

function configuredCodexProfile(
  configuration: CodexProviderConfiguration,
): AgentProfile {
  const defaultProfile = defaultAgentRegistry.profiles.find(
    (profile) => profile.runtime === "codex" && profile.provider === "openai",
  );

  if (!defaultProfile) {
    throw new Error("No Codex agent profile is registered.");
  }

  return Object.freeze({
    ...defaultProfile,
    id: "configured.codex",
    model: configuration.model ?? defaultProfile.model,
    capabilities: Object.freeze([...defaultProfile.capabilities]),
    permissions: Object.freeze([...defaultProfile.permissions]),
    budget: Object.freeze({ ...defaultProfile.budget }),
  });
}

export const codexProviderRegistration: LoopProviderRegistration =
  Object.freeze({
    id: "codex",
    assemble(configuration): LoopProviderAssembly {
      const executor = createCodexCliLoopExecutor({
        executable: configuration.executable,
        ...(configuration.model ? { model: configuration.model } : {}),
        ...(configuration.timeoutMs
          ? { timeoutMs: configuration.timeoutMs }
          : {}),
      });
      const agentRegistry = createAgentRegistry([
        configuredCodexProfile(configuration),
      ]);

      return Object.freeze({ id: "codex", executor, agentRegistry });
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

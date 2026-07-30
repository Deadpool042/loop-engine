import { createAgentRegistry, type AgentRegistry } from "../agents/registry.js";
import type { AgentBudget, AgentProfile } from "../agents/types.js";
import type {
  LoopExecutor,
  LoopProviderFailoverAttempt,
} from "../core/index.js";
import type { LoopExecutionPlan } from "../loop/execution-plan.js";
import { createEvidenceAwareProviderFailoverLoopExecutor } from "../loop/provider-failover-evidence-executor.js";
import type { LoopProviderAssembly } from "./provider-registry.js";

export type LoopProviderFailoverAssembly = Readonly<{
  executor: LoopExecutor;
  agentRegistry: AgentRegistry;
  providerIds: readonly string[];
  maxAttempts: number;
}>;

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function intersectBudget(
  primary: AgentBudget,
  fallback: AgentBudget,
): AgentBudget {
  return Object.freeze({
    maxTokens: minNullable(primary.maxTokens, fallback.maxTokens),
    maxCostUsd: minNullable(primary.maxCostUsd, fallback.maxCostUsd),
    maxDurationMs: minNullable(primary.maxDurationMs, fallback.maxDurationMs),
    maxCalls: minNullable(primary.maxCalls, fallback.maxCalls),
    maxRepairs: minNullable(primary.maxRepairs, fallback.maxRepairs),
  });
}

function supportsPrimaryPolicy(
  profile: AgentProfile,
  primaryPlan: LoopExecutionPlan,
): boolean {
  return (
    primaryPlan.policy.requiredCapabilities.every((capability) =>
      profile.capabilities.includes(capability),
    ) &&
    primaryPlan.policy.requiredPermissions.every((permission) =>
      profile.permissions.includes(permission),
    )
  );
}

function selectFallbackProfile(
  assembly: LoopProviderAssembly,
  primaryPlan: LoopExecutionPlan,
): AgentProfile | null {
  return (
    assembly.agentRegistry.profiles.find((profile) =>
      supportsPrimaryPolicy(profile, primaryPlan),
    ) ?? null
  );
}

export function createFallbackExecutionPlan(
  primaryPlan: LoopExecutionPlan,
  profile: AgentProfile,
): LoopExecutionPlan {
  if (!supportsPrimaryPolicy(profile, primaryPlan)) {
    throw new TypeError(
      `Fallback profile ${profile.id} does not satisfy the admitted policy.`,
    );
  }

  return Object.freeze({
    ...primaryPlan,
    provider: profile.provider,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    effort: profile.effort,
    budget: intersectBudget(primaryPlan.budget, profile.budget),
    policy: Object.freeze({
      ...primaryPlan.policy,
      requiredCapabilities: Object.freeze([
        ...primaryPlan.policy.requiredCapabilities,
      ]),
      requiredPermissions: Object.freeze([
        ...primaryPlan.policy.requiredPermissions,
      ]),
      rationale: Object.freeze([
        ...primaryPlan.policy.rationale,
        `Fallback admitted through profile ${profile.id}.`,
      ]),
    }),
  });
}

function matchesPrimaryPlan(
  assembly: LoopProviderAssembly,
  primaryPlan: LoopExecutionPlan,
): boolean {
  return assembly.agentRegistry.profiles.some(
    (profile) =>
      profile.id === primaryPlan.profileId &&
      profile.provider === primaryPlan.provider &&
      profile.runtime === primaryPlan.runtime &&
      profile.model === primaryPlan.model,
  );
}

function resolveAttempts(
  assemblies: readonly LoopProviderAssembly[],
  primaryPlan: LoopExecutionPlan,
): readonly LoopProviderFailoverAttempt[] {
  const primaryIndex = assemblies.findIndex((assembly) =>
    matchesPrimaryPlan(assembly, primaryPlan),
  );
  if (primaryIndex < 0) return Object.freeze([]);

  const primaryAssembly = assemblies[primaryIndex];
  if (!primaryAssembly) return Object.freeze([]);
  const ordered = [
    primaryAssembly,
    ...assemblies.slice(0, primaryIndex),
    ...assemblies.slice(primaryIndex + 1),
  ];
  const attempts: LoopProviderFailoverAttempt[] = [];

  for (const assembly of ordered) {
    if (attempts.length === 0) {
      attempts.push(Object.freeze({ plan: primaryPlan, executor: assembly.executor }));
      continue;
    }
    const profile = selectFallbackProfile(assembly, primaryPlan);
    if (!profile) continue;
    attempts.push(
      Object.freeze({
        plan: createFallbackExecutionPlan(primaryPlan, profile),
        executor: assembly.executor,
      }),
    );
  }

  return Object.freeze(attempts);
}

export function createLoopProviderFailoverAssembly(
  assemblies: readonly LoopProviderAssembly[],
  maxAttempts: number,
): LoopProviderFailoverAssembly {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new TypeError("maxAttempts must be a positive integer.");
  }
  if (assemblies.length === 0) {
    throw new TypeError("At least one provider assembly is required.");
  }

  const providerIds = assemblies.map((assembly) => assembly.id);
  if (new Set(providerIds).size !== providerIds.length) {
    throw new TypeError("Provider failover assembly requires unique provider ids.");
  }

  const profiles = assemblies.flatMap((assembly) => [
    ...assembly.agentRegistry.profiles,
  ]);
  const agentRegistry = createAgentRegistry(profiles);
  const boundedMaxAttempts = Math.min(maxAttempts, assemblies.length);
  const executor = createEvidenceAwareProviderFailoverLoopExecutor(
    (primaryPlan) => resolveAttempts(assemblies, primaryPlan),
    { maxAttempts: boundedMaxAttempts },
  );

  return Object.freeze({
    executor,
    agentRegistry,
    providerIds: Object.freeze([...providerIds]),
    maxAttempts: boundedMaxAttempts,
  });
}

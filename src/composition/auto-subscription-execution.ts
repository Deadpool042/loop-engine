import {
  AGENT_AVAILABILITY_STATES,
  AGENT_CAPABILITIES,
  AGENT_ECONOMIC_TIERS,
  AGENT_EFFORTS,
  AGENT_PERMISSIONS,
  AGENT_PROVIDERS,
  AGENT_QUOTA_SOURCES,
  AGENT_QUOTA_STATES,
  type AgentAvailabilityState,
  type AgentBudget,
  type AgentCapability,
  type AgentEconomicTier,
  type AgentEffort,
  type AgentPermission,
  type AgentProfile,
  type AgentProvider,
  type AgentQuotaSnapshot,
} from "../agents/types.js";
import { decideAgentRoute, type AgentRouteDecision } from "../agents/router.js";
import type { AgentEfficiencySignal } from "../agents/selector.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import {
  assembleLoopProviders,
  defaultLoopProviderRegistry,
  type LoopProviderConfiguration,
  type LoopProviderModelProfileConfiguration,
} from "./provider-registry.js";

export const AUTO_SUBSCRIPTION_PORTFOLIO_ENV =
  "LOOP_AUTO_SUBSCRIPTION_PORTFOLIO_JSON";

export type AutoSubscriptionModelProfile = Readonly<{
  id: string;
  model: string;
  economicTier?: AgentEconomicTier;
  availability: AgentAvailabilityState;
  quota: AgentQuotaSnapshot;
  effort?: AgentEffort;
  capabilities: readonly AgentCapability[];
}>;

export type AutoSubscriptionNativeOpenClawProfile =
  AutoSubscriptionModelProfile &
    Readonly<{
      provider: AgentProvider;
      permissions: readonly AgentPermission[];
      budget: AgentBudget;
    }>;

export type AutoSubscriptionModelPortfolio = Readonly<{
  codex?: readonly AutoSubscriptionModelProfile[];
  claude_code?: readonly AutoSubscriptionModelProfile[];
  openclaw?: readonly AutoSubscriptionNativeOpenClawProfile[];
}>;

export type AutoSubscriptionExecutionCandidate = Readonly<{
  profile: AgentProfile;
  executionPath: "direct_cli" | "openclaw_native";
  executableNow: boolean;
  reason: "direct_cli_binding_configured" | "openclaw_native_binding_not_yet_promoted";
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfile(value: unknown): AutoSubscriptionModelProfile {
  if (!isRecord(value)) {
    throw new TypeError("AUTO subscription profile must be an object.");
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!id || !model) {
    throw new TypeError(
      "AUTO subscription profile requires non-empty id and model values.",
    );
  }
  if (
    typeof value.availability !== "string" ||
    !(AGENT_AVAILABILITY_STATES as readonly string[]).includes(
      value.availability,
    )
  ) {
    throw new TypeError(
      `AUTO subscription profile ${id} requires explicit availability evidence.`,
    );
  }
  if (!isRecord(value.quota)) {
    throw new TypeError(
      `AUTO subscription profile ${id} requires explicit quota evidence.`,
    );
  }
  if (
    typeof value.quota.state !== "string" ||
    !(AGENT_QUOTA_STATES as readonly string[]).includes(value.quota.state) ||
    typeof value.quota.source !== "string" ||
    !(AGENT_QUOTA_SOURCES as readonly string[]).includes(value.quota.source)
  ) {
    throw new TypeError(
      `AUTO subscription profile ${id} has invalid quota evidence.`,
    );
  }
  if (
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(
      (capability) =>
        typeof capability === "string" &&
        (AGENT_CAPABILITIES as readonly string[]).includes(capability),
    )
  ) {
    throw new TypeError(
      `AUTO subscription profile ${id} requires explicit valid capabilities.`,
    );
  }
  if (
    value.economicTier !== undefined &&
    (typeof value.economicTier !== "string" ||
      !(AGENT_ECONOMIC_TIERS as readonly string[]).includes(value.economicTier))
  ) {
    throw new TypeError(
      `AUTO subscription profile ${id} has invalid economic tier evidence.`,
    );
  }
  if (
    value.effort !== undefined &&
    (typeof value.effort !== "string" ||
      !(AGENT_EFFORTS as readonly string[]).includes(value.effort))
  ) {
    throw new TypeError(
      `AUTO subscription profile ${id} has invalid effort evidence.`,
    );
  }

  return Object.freeze({
    id,
    model,
    availability: value.availability as AgentAvailabilityState,
    quota: Object.freeze({
      state: value.quota.state as AgentQuotaSnapshot["state"],
      source: value.quota.source as AgentQuotaSnapshot["source"],
    }),
    capabilities: Object.freeze([
      ...new Set(value.capabilities as AgentCapability[]),
    ]),
    ...(value.economicTier === undefined
      ? {}
      : { economicTier: value.economicTier as AgentEconomicTier }),
    ...(value.effort === undefined
      ? {}
      : { effort: value.effort as AgentEffort }),
  });
}

function parseProviderProfiles(
  value: unknown,
  provider: "codex" | "claude_code",
): readonly AutoSubscriptionModelProfile[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      `AUTO subscription portfolio ${provider} profiles must be a non-empty array.`,
    );
  }
  const profiles = value.map(parseProfile);
  const ids = profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(
      `AUTO subscription portfolio ${provider} contains duplicate profile ids.`,
    );
  }
  return Object.freeze(profiles);
}

function parseBudget(value: unknown, id: string): AgentBudget {
  if (!isRecord(value)) {
    throw new TypeError(
      `AUTO OpenClaw profile ${id} requires an explicit execution budget.`,
    );
  }
  const dimensions = [
    "maxTokens",
    "maxCostUsd",
    "maxDurationMs",
    "maxCalls",
    "maxRepairs",
  ] as const;
  const budget = Object.fromEntries(
    dimensions.map((dimension) => {
      const candidate = value[dimension];
      if (
        candidate !== null &&
        (typeof candidate !== "number" ||
          !Number.isFinite(candidate) ||
          candidate < 0)
      ) {
        throw new TypeError(
          `AUTO OpenClaw profile ${id} has invalid budget.${dimension}.`,
        );
      }
      return [dimension, candidate];
    }),
  ) as AgentBudget;
  return Object.freeze(budget);
}

function parseOpenClawProfiles(
  value: unknown,
): readonly AutoSubscriptionNativeOpenClawProfile[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      "AUTO subscription portfolio openclaw profiles must be a non-empty array.",
    );
  }
  const profiles = value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new TypeError("AUTO OpenClaw profile must be an object.");
    }
    const base = parseProfile(candidate);
    if (
      typeof candidate.provider !== "string" ||
      !(AGENT_PROVIDERS as readonly string[]).includes(candidate.provider)
    ) {
      throw new TypeError(
        `AUTO OpenClaw profile ${base.id} requires an explicit valid provider.`,
      );
    }
    if (
      !Array.isArray(candidate.permissions) ||
      !candidate.permissions.every(
        (permission) =>
          typeof permission === "string" &&
          (AGENT_PERMISSIONS as readonly string[]).includes(permission),
      )
    ) {
      throw new TypeError(
        `AUTO OpenClaw profile ${base.id} requires explicit valid permissions.`,
      );
    }
    return Object.freeze({
      ...base,
      provider: candidate.provider as AgentProvider,
      permissions: Object.freeze([
        ...new Set(candidate.permissions as AgentPermission[]),
      ]),
      budget: parseBudget(candidate.budget, base.id),
    });
  });
  const ids = profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(
      "AUTO subscription portfolio openclaw contains duplicate profile ids.",
    );
  }
  return Object.freeze(profiles);
}

export function parseAutoSubscriptionModelPortfolio(
  value: unknown,
): AutoSubscriptionModelPortfolio {
  if (!isRecord(value)) {
    throw new TypeError("AUTO subscription portfolio must be an object.");
  }
  const codex = parseProviderProfiles(value.codex, "codex");
  const claudeCode = parseProviderProfiles(value.claude_code, "claude_code");
  const openclaw = parseOpenClawProfiles(value.openclaw);
  if (codex === undefined && claudeCode === undefined && openclaw === undefined) {
    throw new TypeError(
      "AUTO subscription portfolio contains no explicitly observed runtime profiles.",
    );
  }
  return Object.freeze({
    ...(codex === undefined ? {} : { codex }),
    ...(claudeCode === undefined ? {} : { claude_code: claudeCode }),
    ...(openclaw === undefined ? {} : { openclaw }),
  });
}

export function loadAutoSubscriptionModelPortfolioFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AutoSubscriptionModelPortfolio {
  const raw = environment[AUTO_SUBSCRIPTION_PORTFOLIO_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new TypeError(
      `${AUTO_SUBSCRIPTION_PORTFOLIO_ENV} is required; AUTO never infers a model catalog.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError(`${AUTO_SUBSCRIPTION_PORTFOLIO_ENV} must be valid JSON.`);
  }
  return parseAutoSubscriptionModelPortfolio(parsed);
}

function asConfiguredProfiles(
  profiles: readonly AutoSubscriptionModelProfile[],
): readonly LoopProviderModelProfileConfiguration[] {
  return Object.freeze(
    profiles.map((profile) =>
      Object.freeze({
        id: profile.id,
        model: profile.model,
        ...(profile.economicTier === undefined
          ? {}
          : { economicTier: profile.economicTier }),
        availability: profile.availability,
        fundingMode: "included_subscription" as const,
        quota: Object.freeze({ ...profile.quota }),
        ...(profile.effort === undefined ? {} : { effort: profile.effort }),
        capabilities: Object.freeze([...profile.capabilities]),
      }),
    ),
  );
}

function asOpenClawAgentProfile(
  profile: AutoSubscriptionNativeOpenClawProfile,
): AgentProfile {
  return Object.freeze({
    id: `configured.openclaw.${profile.id}`,
    runtime: "openclaw" as const,
    provider: profile.provider,
    model: profile.model,
    effort: profile.effort ?? "low",
    ...(profile.economicTier === undefined
      ? {}
      : { economicTier: profile.economicTier }),
    availability: profile.availability,
    fundingMode: "included_subscription" as const,
    quota: Object.freeze({ ...profile.quota }),
    capabilities: Object.freeze([...profile.capabilities]),
    permissions: Object.freeze([...profile.permissions]),
    budget: Object.freeze({ ...profile.budget }),
  });
}

/**
 * AUTO routing candidates are broader than the currently executable bindings.
 * Direct CLI candidates are executable through the existing provider assembly.
 * OpenClaw-native candidates are represented explicitly by runtime identity but
 * remain non-executable until a separately qualified native binding replaces
 * the deterministic OpenClaw runtime stub.
 */
export function buildAutoSubscriptionExecutionCandidates(
  portfolio: AutoSubscriptionModelPortfolio,
): readonly AutoSubscriptionExecutionCandidate[] {
  const candidates: AutoSubscriptionExecutionCandidate[] = [];
  if (portfolio.codex !== undefined || portfolio.claude_code !== undefined) {
    const directConfigurations = buildAutoSubscriptionProviderConfigurations({
      ...(portfolio.codex === undefined ? {} : { codex: portfolio.codex }),
      ...(portfolio.claude_code === undefined
        ? {}
        : { claude_code: portfolio.claude_code }),
    });
    const assemblies = assembleLoopProviders(
      defaultLoopProviderRegistry,
      directConfigurations,
    );
    for (const profile of assemblies.flatMap((assembly) => [
      ...assembly.agentRegistry.profiles,
    ])) {
      candidates.push(
        Object.freeze({
          profile,
          executionPath: "direct_cli" as const,
          executableNow: true,
          reason: "direct_cli_binding_configured" as const,
        }),
      );
    }
  }

  for (const profile of portfolio.openclaw ?? []) {
    candidates.push(
      Object.freeze({
        profile: asOpenClawAgentProfile(profile),
        executionPath: "openclaw_native" as const,
        executableNow: false,
        reason: "openclaw_native_binding_not_yet_promoted" as const,
      }),
    );
  }

  return Object.freeze(
    candidates.sort((left, right) =>
      left.profile.id.localeCompare(right.profile.id),
    ),
  );
}

export function decideAutoSubscriptionRoute(
  portfolio: AutoSubscriptionModelPortfolio,
  policy: AgentPolicyResolution,
  efficiencySignals: readonly AgentEfficiencySignal[],
): AgentRouteDecision {
  if (policy.status !== "resolved") {
    throw new TypeError(
      "AUTO route requires a resolved AgentPolicyResolution.",
    );
  }
  return decideAgentRoute({
    candidates: buildAutoSubscriptionExecutionCandidates(portfolio).map(
      (candidate) =>
        Object.freeze({
          profile: candidate.profile,
          executionPath: candidate.executionPath,
          executableNow: candidate.executableNow,
          bindingReason: candidate.reason,
        }),
    ),
    request: Object.freeze({
      ...policy.selectionRequest,
      requireKnownQuota: true,
    }),
    effort: policy.requirements.minimumEffort,
    efficiencySignals,
  });
}

/**
 * Builds the subscription-only provider set from an externally observed or
 * operator-approved portfolio. No provider model, tier, availability, quota or
 * capability is inferred here. The only policy owned by this layer is that
 * AUTO subscription never authorizes paid API/additional-credit funding.
 */
export function buildAutoSubscriptionProviderConfigurations(
  portfolio: AutoSubscriptionModelPortfolio,
): readonly LoopProviderConfiguration[] {
  const configurations: LoopProviderConfiguration[] = [];

  if (portfolio.claude_code !== undefined) {
    configurations.push(
      Object.freeze({
        id: "claude_code" as const,
        executable: "claude",
        timeoutMs: 360_000,
        maxTurns: 24,
        profiles: asConfiguredProfiles(portfolio.claude_code),
      }),
    );
  }
  if (portfolio.codex !== undefined) {
    configurations.push(
      Object.freeze({
        id: "codex" as const,
        executable: "codex",
        timeoutMs: 360_000,
        profiles: asConfiguredProfiles(portfolio.codex),
      }),
    );
  }

  if (configurations.length === 0) {
    throw new TypeError(
      "AUTO subscription portfolio produced no provider configuration.",
    );
  }
  return Object.freeze(configurations);
}

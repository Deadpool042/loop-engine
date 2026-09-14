import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import { selectAgentProfile } from "../../src/agents/selector.js";
import {
  decideAutoContinuationRoute,
} from "../../src/composition/auto-route-handoff.js";
import {
  AUTO_SUBSCRIPTION_PORTFOLIO_ENV,
  buildAutoSubscriptionExecutionCandidates,
  buildAutoSubscriptionProviderConfigurations,
  decideAutoSubscriptionRoute,
  loadAutoSubscriptionModelPortfolioFromEnvironment,
  parseAutoSubscriptionModelPortfolio,
  type AutoSubscriptionModelPortfolio,
} from "../../src/composition/auto-subscription-execution.js";
import {
  assembleLoopProviders,
  defaultLoopProviderRegistry,
} from "../../src/composition/provider-registry.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";

const BASE_CAPABILITIES = [
  "code_edit",
  "shell_exec",
  "test_execution",
] as const;

function resolvedPolicy(
  effort: "low" | "medium" = "medium",
  category: "code" | "review" | "architecture" = "code",
): AgentPolicyResolution {
  return {
    policyId: "auto-test-policy",
    mode: "execute",
    status: "resolved",
    requirements: {
      category,
      mode: "execute",
      requiredCapabilities: ["code_edit", "shell_exec"],
      requiredTools: ["filesystem_read", "filesystem_write", "shell_exec"],
      scope: "bounded_write",
      complexity: "medium",
      requiredPermissions: ["write_worktree"],
      minimumEffort: effort,
      maximumEffort: "high",
      contextBudget: {
        maxFiles: 8,
        maxCharacters: 40_000,
        maxEstimatedTokens: 10_000,
        includeFullFiles: false,
      },
      executionBudget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: 360_000,
        maxCalls: 1,
        maxRepairs: 1,
      },
      rationale: ["fixture"],
    },
    selectionRequest: {
      requiredCapabilities: ["code_edit", "shell_exec"],
      requiredPermissions: ["write_worktree"],
      allowedFundingModes: ["included_subscription"],
    },
    selection: null,
    reasons: ["fixture"],
    fallback: { active: false, reason: null },
  };
}

function observedPortfolio(): AutoSubscriptionModelPortfolio {
  return {
    claude_code: [
      {
        id: "observed-claude",
        model: "runtime-observed-claude-model",
        economicTier: "standard",
        availability: "available",
        quota: { state: "unknown", source: "unavailable" },
        capabilities: [...BASE_CAPABILITIES, "long_context"],
      },
    ],
    codex: [
      {
        id: "observed-codex",
        model: "runtime-observed-openai-model",
        economicTier: "standard",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: [...BASE_CAPABILITIES, "long_context"],
      },
    ],
  };
}

test("AUTO builds only the explicitly observed subscription portfolio", () => {
  const configurations = buildAutoSubscriptionProviderConfigurations(
    observedPortfolio(),
  );
  assert.equal(configurations.length, 2);
  const [claude, codex] = configurations;
  assert.ok(claude);
  assert.ok(codex);

  assert.equal(claude.id, "claude_code");
  assert.equal(claude.executable, "claude");
  assert.equal("maxTurns" in claude ? claude.maxTurns : null, 24);
  assert.deepEqual(
    claude.profiles?.map((profile) => ({
      id: profile.id,
      model: profile.model,
      availability: profile.availability,
      funding: profile.fundingMode,
      quota: profile.quota,
    })),
    [
      {
        id: "observed-claude",
        model: "runtime-observed-claude-model",
        availability: "available",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
    ],
  );

  assert.equal(codex.id, "codex");
  assert.equal(codex.executable, "codex");
  assert.deepEqual(
    codex.profiles?.map((profile) => ({
      id: profile.id,
      model: profile.model,
      availability: profile.availability,
      funding: profile.fundingMode,
      quota: profile.quota,
    })),
    [
      {
        id: "observed-codex",
        model: "runtime-observed-openai-model",
        availability: "available",
        funding: "included_subscription",
        quota: { state: "available", source: "runtime_report" },
      },
    ],
  );
});

test("AUTO never infers a portfolio when runtime/deployment evidence is missing", () => {
  assert.throws(
    () => loadAutoSubscriptionModelPortfolioFromEnvironment({}),
    new RegExp(`${AUTO_SUBSCRIPTION_PORTFOLIO_ENV} is required`),
  );
  assert.throws(
    () => parseAutoSubscriptionModelPortfolio({}),
    /contains no explicitly observed runtime profiles/,
  );
});

test("AUTO accepts arbitrary runtime-observed model identifiers without a built-in catalog", () => {
  const portfolio = loadAutoSubscriptionModelPortfolioFromEnvironment({
    [AUTO_SUBSCRIPTION_PORTFOLIO_ENV]: JSON.stringify({
      codex: [
        {
          id: "runtime-a",
          model: "future-openai-model-alias",
          availability: "available",
          quota: { state: "unknown", source: "unavailable" },
          capabilities: BASE_CAPABILITIES,
        },
      ],
      claude_code: [
        {
          id: "runtime-b",
          model: "enterprise-claude-alias",
          availability: "available",
          quota: { state: "unknown", source: "unavailable" },
          capabilities: BASE_CAPABILITIES,
        },
      ],
    }),
  });

  assert.deepEqual(
    buildAutoSubscriptionProviderConfigurations(portfolio).flatMap(
      (configuration) => configuration.profiles?.map((profile) => profile.model) ?? [],
    ),
    ["enterprise-claude-alias", "future-openai-model-alias"],
  );
});

test("AUTO represents OpenClaw native as a distinct non-CLI execution candidate", () => {
  const portfolio = parseAutoSubscriptionModelPortfolio({
    openclaw: [
      {
        id: "native-openclaw",
        provider: "openai",
        model: "runtime-observed-openclaw-model",
        economicTier: "standard",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: ["code_edit", "shell_exec", "test_execution"],
        permissions: ["read_only", "write_worktree", "shell_exec"],
        budget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: 300_000,
          maxCalls: 1,
          maxRepairs: 1,
        },
      },
    ],
  });

  const candidates = buildAutoSubscriptionExecutionCandidates(portfolio);
  assert.equal(candidates.length, 1);
  assert.deepEqual(
    candidates.map((candidate) => ({
      id: candidate.profile.id,
      runtime: candidate.profile.runtime,
      provider: candidate.profile.provider,
      model: candidate.profile.model,
      executionPath: candidate.executionPath,
      executableNow: candidate.executableNow,
      reason: candidate.reason,
    })),
    [
      {
        id: "configured.openclaw.native-openclaw",
        runtime: "openclaw",
        provider: "openai",
        model: "runtime-observed-openclaw-model",
        executionPath: "openclaw_native",
        executableNow: false,
        reason: "openclaw_native_binding_not_yet_promoted",
      },
    ],
  );
  assert.throws(
    () => buildAutoSubscriptionProviderConfigurations(portfolio),
    /produced no provider configuration/,
  );
});

test("AUTO candidate portfolio can compare direct CLI and OpenClaw runtimes without collapsing their identities", () => {
  const portfolio = parseAutoSubscriptionModelPortfolio({
    codex: [
      {
        id: "direct-codex",
        model: "observed-codex-model",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: BASE_CAPABILITIES,
      },
    ],
    openclaw: [
      {
        id: "native-openclaw",
        provider: "openai",
        model: "observed-openclaw-model",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: BASE_CAPABILITIES,
        permissions: ["read_only", "write_worktree", "shell_exec"],
        budget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: 300_000,
          maxCalls: 1,
          maxRepairs: 1,
        },
      },
    ],
  });

  const candidates = buildAutoSubscriptionExecutionCandidates(portfolio);
  assert.deepEqual(
    candidates.map((candidate) => ({
      runtime: candidate.profile.runtime,
      path: candidate.executionPath,
      executableNow: candidate.executableNow,
    })),
    [
      { runtime: "codex", path: "direct_cli", executableNow: true },
      { runtime: "openclaw", path: "openclaw_native", executableNow: false },
    ],
  );
});

test("AUTO route derives runtime/provider/model/effort from the resolved policy and observed portfolio", () => {
  const decision = decideAutoSubscriptionRoute(
    observedPortfolio(),
    resolvedPolicy("medium"),
    [
      {
        profileId: "configured.claude_code.observed-claude",
        status: "available",
        quotaWindowLabel: "Week",
        expectedValuePercent: 80,
        expectedQuotaConsumedPercent: 10,
        sampleSize: 5,
      },
      {
        profileId: "configured.codex.observed-codex",
        status: "available",
        quotaWindowLabel: "Week",
        expectedValuePercent: 90,
        expectedQuotaConsumedPercent: 5,
        sampleSize: 5,
      },
    ],
  );

  assert.equal(decision.outcome, "selected");
  assert.deepEqual(decision.selected, {
    profileId: "configured.codex.observed-codex",
    runtime: "codex",
    provider: "openai",
    model: "runtime-observed-openai-model",
    effort: "medium",
    executionPath: "direct_cli",
    basis: "measured_efficiency",
    efficiencyScore: 18,
    quotaWindowLabel: "Week",
    expectedValuePercent: 90,
    expectedQuotaConsumedPercent: 5,
    sampleSize: 5,
  });
  assert.deepEqual(
    decision.notSelected.map((candidate) => ({
      profileId: candidate.profileId,
      reason: candidate.reason,
    })),
    [
      {
        profileId: "configured.claude_code.observed-claude",
        reason: "hard_gate",
      },
    ],
  );
});

test("AUTO refuses to select any executor when every candidate lacks proven quota", () => {
  const portfolio: AutoSubscriptionModelPortfolio = {
    codex: [
      {
        id: "codex-unknown-quota",
        model: "observed-openai",
        economicTier: "standard",
        availability: "available",
        quota: { state: "unknown", source: "unavailable" },
        capabilities: BASE_CAPABILITIES,
      },
    ],
    claude_code: [
      {
        id: "claude-unknown-quota",
        model: "observed-claude",
        economicTier: "standard",
        availability: "available",
        quota: { state: "unknown", source: "unavailable" },
        capabilities: BASE_CAPABILITIES,
      },
    ],
  };

  const decision = decideAutoSubscriptionRoute(
    portfolio,
    resolvedPolicy("medium"),
    [],
  );

  assert.equal(decision.outcome, "no_match");
  assert.equal(decision.selected, null);
  assert.deepEqual(
    decision.notSelected.map((candidate) => ({
      profileId: candidate.profileId,
      reason: candidate.reason,
    })),
    [
      {
        profileId: "configured.claude_code.claude-unknown-quota",
        reason: "hard_gate",
      },
      {
        profileId: "configured.codex.codex-unknown-quota",
        reason: "hard_gate",
      },
    ],
  );
});

test("AUTO production builder contains no hardcoded commercial model catalog", () => {
  const source = readFileSync(
    "src/composition/auto-subscription-execution.ts",
    "utf8",
  );
  assert.doesNotMatch(source, /gpt-|claude-(?:haiku|sonnet|opus|fable)/i);
});

test("AUTO continuation selects ChatGPT handoff for governed review work without inventing a model or quota", () => {
  const route = decideAutoContinuationRoute(
    resolvedPolicy("medium", "review"),
    {
      outcome: "selected",
      selected: {
        profileId: "configured.codex.observed-codex",
        runtime: "codex",
        provider: "openai",
        model: "runtime-observed-openai-model",
        effort: "medium",
        executionPath: "direct_cli",
        basis: "smallest_capable",
        efficiencyScore: null,
        quotaWindowLabel: null,
        expectedValuePercent: null,
        expectedQuotaConsumedPercent: null,
        sampleSize: null,
      },
      notSelected: [],
    },
  );

  assert.deepEqual(route, {
    profileId: "interactive.chatgpt",
    runtime: "chatgpt",
    provider: "openai",
    model: null,
    effort: "medium",
    executionPath: "chatgpt_handoff",
    basis: "governed_interactive_category",
    efficiencyScore: null,
    quotaWindowLabel: null,
    expectedValuePercent: null,
    expectedQuotaConsumedPercent: null,
    sampleSize: null,
  });
});

test("AUTO can select Claude direct CLI when Claude is the safe observed subscription route", () => {
  const portfolio: AutoSubscriptionModelPortfolio = {
    claude_code: [
      {
        id: "claude-safe",
        model: "runtime-observed-claude",
        economicTier: "standard",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: [...BASE_CAPABILITIES, "long_context"],
      },
    ],
    codex: [
      {
        id: "codex-unavailable",
        model: "runtime-observed-openai",
        economicTier: "standard",
        availability: "unavailable",
        quota: { state: "unknown", source: "unavailable" },
        capabilities: [...BASE_CAPABILITIES, "long_context"],
      },
    ],
  };
  const decision = decideAutoSubscriptionRoute(portfolio, resolvedPolicy(), []);
  assert.equal(decision.outcome, "selected");
  assert.equal(decision.selected?.runtime, "claude_code");
  assert.equal(decision.selected?.executionPath, "direct_cli");
});

test("AUTO continuation keeps a safe direct CLI route for bounded code work", () => {
  const selected = {
    profileId: "configured.codex.observed-codex",
    runtime: "codex" as const,
    provider: "openai" as const,
    model: "runtime-observed-openai-model",
    effort: "medium" as const,
    executionPath: "direct_cli",
    basis: "smallest_capable" as const,
    efficiencyScore: null,
    quotaWindowLabel: null,
    expectedValuePercent: null,
    expectedQuotaConsumedPercent: null,
    sampleSize: null,
  };
  const route = decideAutoContinuationRoute(resolvedPolicy(), {
    outcome: "selected",
    selected,
    notSelected: [],
  });
  assert.deepEqual(route, selected);
});

test("AUTO continuation falls back to ChatGPT when no autonomous route survives hard gates", () => {
  const route = decideAutoContinuationRoute(resolvedPolicy("medium", "code"), {
    outcome: "no_match",
    selected: null,
    notSelected: [
      {
        profileId: "configured.codex.observed-codex",
        runtime: "codex",
        provider: "openai",
        model: "runtime-observed-openai-model",
        executionPath: "direct_cli",
        reason: "hard_gate",
        detail: "profile quota is not proven available (source: unavailable)",
      },
    ],
  });
  assert.equal(route?.executionPath, "chatgpt_handoff");
  assert.equal(route?.basis, "no_safe_autonomous_route");
});

test("AUTO continuation invents no route when policy resolution is not resolved", () => {
  const unresolved: AgentPolicyResolution = {
    ...resolvedPolicy(),
    status: "no_compatible_agent",
  };
  const route = decideAutoContinuationRoute(unresolved, {
    outcome: "no_match",
    selected: null,
    notSelected: [],
  });
  assert.equal(route, null);
});

test("AUTO policy selects only admissible observed profiles and keeps provider preference secondary to hard gates", () => {
  const portfolio: AutoSubscriptionModelPortfolio = {
    claude_code: [
      {
        id: "claude-unavailable",
        model: "observed-claude",
        economicTier: "economy",
        availability: "unavailable",
        quota: { state: "unknown", source: "unavailable" },
        capabilities: BASE_CAPABILITIES,
      },
    ],
    codex: [
      {
        id: "codex-available",
        model: "observed-openai",
        economicTier: "standard",
        availability: "available",
        quota: { state: "available", source: "runtime_report" },
        capabilities: BASE_CAPABILITIES,
      },
    ],
  };
  const assemblies = assembleLoopProviders(
    defaultLoopProviderRegistry,
    buildAutoSubscriptionProviderConfigurations(portfolio),
  );
  const registry = createAgentRegistry(
    assemblies.flatMap((assembly) => [...assembly.agentRegistry.profiles]),
  );

  const selection = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "shell_exec"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
    preferredProviders: ["anthropic", "openai"],
  });

  assert.equal(selection.outcome, "selected");
  assert.equal(
    selection.outcome === "selected" ? selection.profile.model : null,
    "observed-openai",
  );
  assert.deepEqual(selection.rejected, [
    {
      profileId: "configured.claude_code.claude-unavailable",
      reason: "profile is explicitly unavailable",
    },
  ]);
});

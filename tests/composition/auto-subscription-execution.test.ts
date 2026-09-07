import assert from "node:assert/strict";
import test from "node:test";

import { selectAgentProfile } from "../../src/agents/selector.js";
import { buildAutoSubscriptionProviderConfigurations } from "../../src/composition/auto-subscription-execution.js";
import { assembleLoopProviders, defaultLoopProviderRegistry } from "../../src/composition/provider-registry.js";

test("AUTO subscription portfolio is Claude-only and subscription-funded", () => {
  const configurations = buildAutoSubscriptionProviderConfigurations();
  assert.equal(configurations.length, 1);
  const [configuration] = configurations;
  assert.ok(configuration);
  assert.equal(configuration.id, "claude_code");
  assert.equal(configuration.executable, "claude");
  assert.equal(configuration.timeoutMs, 420_000);
  assert.equal(configuration.maxTurns, 32);
  assert.equal(configuration.profiles?.length, 3);
  assert.deepEqual(
    configuration.profiles?.map((profile) => ({
      model: profile.model,
      tier: profile.economicTier,
      funding: profile.fundingMode,
      quota: profile.quota,
    })),
    [
      {
        model: "claude-haiku-4-5",
        tier: "economy",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
      {
        model: "claude-sonnet-5",
        tier: "standard",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
      {
        model: "claude-opus-5",
        tier: "advanced",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
    ],
  );
});

test("AUTO selects the smallest capable subscription profile", () => {
  const assemblies = assembleLoopProviders(
    defaultLoopProviderRegistry,
    buildAutoSubscriptionProviderConfigurations(),
  );
  const registry = assemblies[0]!.agentRegistry;

  const simple = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "shell_exec"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(simple.outcome, "selected");
  assert.equal(simple.outcome === "selected" ? simple.profile.model : null, "claude-haiku-4-5");

  const architecture = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "long_context"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(architecture.outcome, "selected");
  assert.equal(architecture.outcome === "selected" ? architecture.profile.model : null, "claude-sonnet-5");

  const refactor = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "long_context", "multi_file_refactor"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(refactor.outcome, "selected");
  assert.equal(refactor.outcome === "selected" ? refactor.profile.model : null, "claude-opus-5");
});

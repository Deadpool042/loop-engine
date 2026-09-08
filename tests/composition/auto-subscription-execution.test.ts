import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import { selectAgentProfile } from "../../src/agents/selector.js";
import { buildAutoSubscriptionProviderConfigurations } from "../../src/composition/auto-subscription-execution.js";
import { assembleLoopProviders, defaultLoopProviderRegistry } from "../../src/composition/provider-registry.js";

test("AUTO subscription portfolio contains qualified Claude and Codex profiles only", () => {
  const configurations = buildAutoSubscriptionProviderConfigurations();
  assert.equal(configurations.length, 2);
  const [claude, codex] = configurations;
  assert.ok(claude);
  assert.ok(codex);

  assert.equal(claude.id, "claude_code");
  assert.equal(claude.executable, "claude");
  assert.equal(claude.timeoutMs, 240_000);
  assert.equal("maxTurns" in claude ? claude.maxTurns : null, 16);
  assert.deepEqual(
    claude.profiles?.map((profile) => ({
      model: profile.model,
      tier: profile.economicTier,
      funding: profile.fundingMode,
      quota: profile.quota,
    })),
    [
      {
        model: "claude-sonnet-5",
        tier: "standard",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
    ],
  );

  assert.equal(codex.id, "codex");
  assert.equal(codex.executable, "codex");
  assert.equal(codex.timeoutMs, 240_000);
  assert.deepEqual(
    codex.profiles?.map((profile) => ({
      model: profile.model,
      tier: profile.economicTier,
      funding: profile.fundingMode,
      quota: profile.quota,
    })),
    [
      {
        model: "gpt-5.6-sol",
        tier: "standard",
        funding: "included_subscription",
        quota: { state: "unknown", source: "unavailable" },
      },
    ],
  );
});

test("AUTO selects a standard capable subscription profile first", () => {
  const assemblies = assembleLoopProviders(
    defaultLoopProviderRegistry,
    buildAutoSubscriptionProviderConfigurations(),
  );
  const registry = createAgentRegistry(
    assemblies.flatMap((assembly) => [...assembly.agentRegistry.profiles]),
  );

  const simple = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "shell_exec"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(simple.outcome, "selected");
  assert.equal(simple.outcome === "selected" ? simple.profile.model : null, "claude-sonnet-5");
  assert.equal(
    simple.outcome === "selected"
      ? simple.notSelected?.some(
          (candidate) => candidate.profileId === "configured.codex.standard",
        )
      : false,
    true,
  );

  const architecture = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "long_context"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(architecture.outcome, "selected");
  assert.equal(architecture.outcome === "selected" ? architecture.profile.model : null, "claude-sonnet-5");
  assert.equal(
    architecture.outcome === "selected"
      ? architecture.notSelected?.some(
          (candidate) => candidate.profileId === "configured.codex.standard",
        )
      : false,
    true,
  );

  const refactor = selectAgentProfile(registry, {
    requiredCapabilities: ["code_edit", "long_context", "multi_file_refactor"],
    requiredPermissions: ["write_worktree"],
    allowedFundingModes: ["included_subscription"],
  });
  assert.equal(refactor.outcome, "no_match");
});

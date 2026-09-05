import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import {
  evaluateAgentProfile,
  selectAgentProfile,
} from "../../src/agents/selector.js";
import type { AgentProfile } from "../../src/agents/types.js";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture",
    runtime: "custom",
    provider: "local",
    model: "fixture-model",
    effort: "low",
    capabilities: [],
    permissions: [],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: null,
      maxRepairs: null,
    },
    ...overrides,
  };
}

describe("selectAgentProfile", () => {
  it("selects the smallest preferred-effort profile among eligible ones", () => {
    const registry = createAgentRegistry([
      profile({ id: "low", effort: "low", capabilities: ["code_edit"] }),
      profile({ id: "high", effort: "high", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "selected");
    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "low",
    );
  });

  it("breaks ties deterministically by id", () => {
    const registry = createAgentRegistry([
      profile({ id: "zeta", capabilities: ["code_edit"] }),
      profile({ id: "alpha", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "alpha",
    );
    assert.deepEqual(
      result.outcome === "selected" ? result.notSelected : null,
      [{ profileId: "zeta", reason: "deterministic_tiebreak" }],
    );
  });

  it("explains why an otherwise compatible higher-effort profile did not win", () => {
    const registry = createAgentRegistry([
      profile({ id: "medium", effort: "medium", capabilities: ["code_edit"] }),
      profile({ id: "low", effort: "low", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.deepEqual(
      result.outcome === "selected" ? result.notSelected : null,
      [{ profileId: "medium", reason: "higher_effort_than_selected" }],
    );
  });

  it("rejects an explicitly unavailable profile before other ranking", () => {
    const registry = createAgentRegistry([
      profile({
        id: "offline",
        capabilities: ["code_edit"],
        economicTier: "economy",
        availability: "unavailable",
      }),
      profile({
        id: "online",
        capabilities: ["code_edit"],
        economicTier: "frontier",
        availability: "available",
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "selected");
    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "online",
    );
    assert.deepEqual(result.rejected, [
      {
        profileId: "offline",
        reason: "profile is explicitly unavailable",
      },
    ]);
  });

  it("enforces provider and runtime allow-lists as hard constraints", () => {
    const registry = createAgentRegistry([
      profile({
        id: "codex",
        runtime: "codex",
        provider: "openai",
        capabilities: ["code_edit"],
      }),
      profile({
        id: "claude",
        runtime: "claude_code",
        provider: "anthropic",
        capabilities: ["code_edit"],
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      allowedProviders: ["openai"],
      allowedRuntimes: ["codex"],
    });

    assert.equal(result.outcome, "selected");
    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "codex",
    );
    assert.deepEqual(result.rejected, [
      { profileId: "claude", reason: "provider anthropic is not allowed" },
    ]);
  });

  it("does not reject a compatible runtime because its preferred effort is below the requested invocation effort", () => {
    const registry = createAgentRegistry([
      profile({
        id: "claude",
        runtime: "claude_code",
        provider: "anthropic",
        effort: "low",
        capabilities: ["code_edit"],
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      minEffort: "medium",
      maxEffort: "high",
    });

    assert.equal(result.outcome, "selected");
    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "claude",
    );
  });

  it("rejects profiles missing a required capability with an explainable reason", () => {
    const registry = createAgentRegistry([
      profile({ id: "no-shell", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit", "shell_exec"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "no_match");
    assert.match(
      result.rejected[0]!.reason,
      /missing capabilities: shell_exec/,
    );
  });

  it("rejects profiles missing a required permission", () => {
    const registry = createAgentRegistry([
      profile({
        id: "read-only",
        capabilities: ["code_edit"],
        permissions: ["read_only"],
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: ["write_worktree"],
    });

    assert.equal(result.outcome, "no_match");
    assert.match(
      result.rejected[0]!.reason,
      /missing permissions: write_worktree/,
    );
  });

  it("rejects a profile whose declared budget exceeds an explicit ceiling", () => {
    const registry = createAgentRegistry([
      profile({
        id: "over-budget",
        capabilities: ["code_edit"],
        budget: {
          maxTokens: 500_000,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      budgetCeiling: { maxTokens: 100_000 },
    });

    assert.equal(result.outcome, "no_match");
    assert.match(
      result.rejected[0]!.reason,
      /budget\.maxTokens \(500000\) exceeds ceiling \(100000\)/,
    );
  });

  it("treats an unbounded profile budget as a violation under an explicit ceiling", () => {
    const registry = createAgentRegistry([
      profile({ id: "unbounded", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      budgetCeiling: { maxTokens: 100_000 },
    });

    assert.equal(result.outcome, "no_match");
    assert.match(
      result.rejected[0]!.reason,
      /budget\.maxTokens \(unbounded\) exceeds ceiling \(100000\)/,
    );
  });

  it("always reports rejected profiles even when a selection succeeds", () => {
    const registry = createAgentRegistry([
      profile({ id: "eligible", capabilities: ["code_edit"] }),
      profile({ id: "missing-cap", capabilities: [] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "selected");
    assert.deepEqual(
      result.rejected.map((rejection) => rejection.profileId),
      ["missing-cap"],
    );
  });

  it("is stable across equivalent registry and capability-set orderings", () => {
    const profiles = [
      profile({
        id: "beta",
        effort: "medium",
        capabilities: ["test_execution", "code_edit"],
      }),
      profile({
        id: "alpha",
        effort: "low",
        capabilities: ["code_edit", "test_execution"],
      }),
    ];
    const request = {
      requiredCapabilities: ["test_execution", "code_edit"] as const,
      requiredPermissions: [] as const,
    };

    const first = selectAgentProfile(createAgentRegistry(profiles), request);
    const second = selectAgentProfile(
      createAgentRegistry(
        [...profiles].reverse().map((candidate) => ({
          ...candidate,
          capabilities: [...candidate.capabilities].reverse(),
        })),
      ),
      {
        ...request,
        requiredCapabilities: [...request.requiredCapabilities].reverse(),
      },
    );

    assert.deepEqual(first, second);
  });
});

describe("evaluateAgentProfile", () => {
  it("accepts a profile satisfying capabilities, permissions and budget independently of invocation effort", () => {
    const candidate = profile({
      capabilities: ["code_edit"],
      permissions: ["read_only"],
      effort: "low",
    });

    const evaluation = evaluateAgentProfile(candidate, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: ["read_only"],
      minEffort: "medium",
      maxEffort: "high",
    });

    assert.equal(evaluation.ok, true);
  });
});

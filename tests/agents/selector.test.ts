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
  it("selects the smallest-effort profile among eligible ones", () => {
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

  it("breaks ties between equal-effort profiles deterministically by id", () => {
    const registry = createAgentRegistry([
      profile({ id: "zeta", effort: "low", capabilities: ["code_edit"] }),
      profile({ id: "alpha", effort: "low", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "alpha",
    );
  });

  it("rejects profiles missing a required capability, with an explainable reason", () => {
    const registry = createAgentRegistry([
      profile({ id: "no-shell", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit", "shell_exec"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "no_match");
    assert.equal(result.rejected.length, 1);
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

  it("rejects profiles whose effort exceeds the requested ceiling", () => {
    const registry = createAgentRegistry([
      profile({
        id: "too-expensive",
        effort: "max",
        capabilities: ["code_edit"],
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      maxEffort: "medium",
    });

    assert.equal(result.outcome, "no_match");
    assert.match(
      result.rejected[0]!.reason,
      /effort max exceeds max effort medium/,
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

  it("treats an unbounded profile budget as a violation once an explicit ceiling is set", () => {
    const registry = createAgentRegistry([
      profile({
        id: "unbounded",
        capabilities: ["code_edit"],
        budget: {
          maxTokens: null,
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
      /budget\.maxTokens \(unbounded\) exceeds ceiling \(100000\)/,
    );
  });

  it("always reports rejected profiles, even when a selection succeeds", () => {
    const registry = createAgentRegistry([
      profile({ id: "eligible", effort: "low", capabilities: ["code_edit"] }),
      profile({ id: "missing-cap", effort: "low", capabilities: [] }),
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

  it("returns no_match with all reasons when no profile is eligible", () => {
    const registry = createAgentRegistry([
      profile({ id: "solo", capabilities: [] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "no_match");
    assert.equal(result.rejected.length, 1);
  });
});

describe("evaluateAgentProfile", () => {
  it("accepts a profile satisfying every constraint", () => {
    const candidate = profile({
      capabilities: ["code_edit"],
      permissions: ["read_only"],
      effort: "low",
    });

    const evaluation = evaluateAgentProfile(candidate, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: ["read_only"],
      maxEffort: "medium",
    });

    assert.equal(evaluation.ok, true);
  });
});

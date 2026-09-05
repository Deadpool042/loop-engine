import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import { selectIntraProviderModelEscalation } from "../../src/loop/model-escalation.js";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture",
    runtime: "codex",
    provider: "openai",
    model: "fixture-model",
    effort: "low",
    economicTier: "economy",
    capabilities: ["code_edit"],
    permissions: ["read_only"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 1,
    },
    ...overrides,
  };
}

describe("selectIntraProviderModelEscalation", () => {
  it("throws for an unknown previous profile id", () => {
    const registry = createAgentRegistry([profile({ id: "known" })]);
    assert.throws(
      () =>
        selectIntraProviderModelEscalation({
          registry,
          request: { requiredCapabilities: [], requiredPermissions: [] },
          previousProfileId: "unknown",
          failureReason: "validation_failed",
        }),
      /Unknown previous agent profile: unknown/,
    );
  });

  it("escalates validation failure to the smallest higher economic tier in the same provider/runtime", () => {
    const registry = createAgentRegistry([
      profile({ id: "luna", model: "luna", economicTier: "economy" }),
      profile({ id: "terra", model: "terra", economicTier: "standard" }),
      profile({ id: "sol", model: "sol", economicTier: "advanced" }),
      profile({
        id: "other-provider",
        provider: "anthropic",
        runtime: "claude_code",
        model: "haiku",
        economicTier: "standard",
      }),
    ]);

    const result = selectIntraProviderModelEscalation({
      registry,
      request: {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only"],
      },
      previousProfileId: "luna",
      failureReason: "validation_failed",
    });

    assert.equal(result.outcome, "escalated");
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "terra");
  });

  it("keeps economic tier separate from invocation effort", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy", effort: "high" }),
      profile({ id: "standard", economicTier: "standard", effort: "low" }),
    ]);

    const result = selectIntraProviderModelEscalation({
      registry,
      request: {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only"],
        maxEffort: "high",
      },
      previousProfileId: "economy",
      failureReason: "validation_failed",
    });

    assert.equal(result.outcome, "escalated");
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "standard");
  });

  it("jumps directly to the smallest higher tier that fills a demonstrated capability gap", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy", capabilities: ["code_edit"] }),
      profile({ id: "standard", economicTier: "standard", capabilities: ["code_edit"] }),
      profile({
        id: "advanced",
        economicTier: "advanced",
        capabilities: ["code_edit", "long_context"],
      }),
      profile({
        id: "frontier",
        economicTier: "frontier",
        capabilities: ["code_edit", "long_context"],
      }),
    ]);

    const result = selectIntraProviderModelEscalation({
      registry,
      request: {
        requiredCapabilities: ["code_edit", "long_context"],
        requiredPermissions: ["read_only"],
      },
      previousProfileId: "economy",
      failureReason: "capability_gap",
    });

    assert.equal(result.outcome, "escalated");
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "advanced");
  });

  it("refuses capability escalation when no missing capability is demonstrated", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy" }),
      profile({ id: "standard", economicTier: "standard" }),
    ]);

    const result = selectIntraProviderModelEscalation({
      registry,
      request: {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only"],
      },
      previousProfileId: "economy",
      failureReason: "capability_gap",
    });

    assert.equal(result.outcome, "not_applicable");
    assert.equal(
      result.outcome === "not_applicable" ? result.reason : null,
      "capability_gap_not_demonstrated",
    );
  });

  it("does not turn runtime or budget failures into a more expensive model attempt", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy" }),
      profile({ id: "standard", economicTier: "standard" }),
    ]);

    const runtime = selectIntraProviderModelEscalation({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: ["read_only"] },
      previousProfileId: "economy",
      failureReason: "runtime_error",
    });
    const budget = selectIntraProviderModelEscalation({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: ["read_only"] },
      previousProfileId: "economy",
      failureReason: "budget_exceeded",
    });

    assert.equal(runtime.outcome, "not_applicable");
    assert.equal(budget.outcome, "not_applicable");
  });

  it("fails closed when the previous profile has no economic tier", () => {
    const registry = createAgentRegistry([
      profile({ id: "legacy", economicTier: undefined }),
      profile({ id: "standard", economicTier: "standard" }),
    ]);
    const result = selectIntraProviderModelEscalation({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: ["read_only"] },
      previousProfileId: "legacy",
      failureReason: "validation_failed",
    });
    assert.equal(result.outcome, "not_applicable");
  });

  it("still applies availability and permission admission to higher tiers", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy" }),
      profile({ id: "standard-unavailable", economicTier: "standard", availability: "unavailable" }),
      profile({ id: "advanced-missing-permission", economicTier: "advanced", permissions: [] }),
    ]);
    const result = selectIntraProviderModelEscalation({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: ["read_only"] },
      previousProfileId: "economy",
      failureReason: "validation_failed",
    });
    assert.equal(result.outcome, "exhausted");
  });

  it("is deterministic for equivalent higher-tier profiles", () => {
    const registry = createAgentRegistry([
      profile({ id: "economy", economicTier: "economy" }),
      profile({ id: "standard-b", economicTier: "standard" }),
      profile({ id: "standard-a", economicTier: "standard" }),
    ]);
    const run = () =>
      selectIntraProviderModelEscalation({
        registry,
        request: { requiredCapabilities: ["code_edit"], requiredPermissions: ["read_only"] },
        previousProfileId: "economy",
        failureReason: "validation_failed",
      });
    assert.deepEqual(run(), run());
    const result = run();
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "standard-a");
  });
});

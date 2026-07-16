import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import { escalateAgentProfile } from "../../src/agents/escalation.js";
import type { AgentProfile } from "../../src/agents/types.js";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture",
    runtime: "custom",
    provider: "local",
    model: "fixture-model",
    effort: "low",
    capabilities: ["code_edit"],
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

describe("escalateAgentProfile", () => {
  it("throws for an unknown previous profile id", () => {
    const registry = createAgentRegistry([profile({ id: "known" })]);

    assert.throws(
      () =>
        escalateAgentProfile({
          registry,
          request: { requiredCapabilities: [], requiredPermissions: [] },
          previousProfileId: "unknown",
          failureReason: "runtime_error",
        }),
      /Unknown previous agent profile: unknown/,
    );
  });

  it("escalates to the smallest profile with strictly greater effort", () => {
    const registry = createAgentRegistry([
      profile({ id: "low", effort: "low" }),
      profile({ id: "medium", effort: "medium" }),
      profile({ id: "high", effort: "high" }),
    ]);

    const result = escalateAgentProfile({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: [] },
      previousProfileId: "low",
      failureReason: "validation_failed",
    });

    assert.equal(result.outcome, "escalated");
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "medium");
  });

  it("never selects a profile at or below the failed profile's effort", () => {
    const registry = createAgentRegistry([
      profile({ id: "same-effort", effort: "medium" }),
      profile({ id: "lower-effort", effort: "low" }),
      profile({ id: "higher-effort", effort: "high" }),
    ]);

    const result = escalateAgentProfile({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: [] },
      previousProfileId: "same-effort",
      failureReason: "capability_gap",
    });

    assert.equal(result.outcome, "escalated");
    assert.equal(result.outcome === "escalated" ? result.profile.id : null, "higher-effort");
    assert.deepEqual(
      result.rejected.map((rejection) => rejection.profileId).sort(),
      ["lower-effort", "same-effort"],
    );
  });

  it("returns exhausted when no higher-effort profile is eligible", () => {
    const registry = createAgentRegistry([profile({ id: "only", effort: "max" })]);

    const result = escalateAgentProfile({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: [] },
      previousProfileId: "only",
      failureReason: "budget_exceeded",
    });

    assert.equal(result.outcome, "exhausted");
    assert.equal(result.rejected[0]?.profileId, "only");
  });

  it("still applies capability/permission/budget filtering during escalation", () => {
    const registry = createAgentRegistry([
      profile({ id: "low", effort: "low" }),
      profile({ id: "high-missing-cap", effort: "high", capabilities: [] }),
    ]);

    const result = escalateAgentProfile({
      registry,
      request: { requiredCapabilities: ["code_edit"], requiredPermissions: [] },
      previousProfileId: "low",
      failureReason: "runtime_error",
    });

    assert.equal(result.outcome, "exhausted");
    const rejection = result.rejected.find((entry) => entry.profileId === "high-missing-cap");
    assert.match(rejection?.reason ?? "", /missing capabilities: code_edit/);
  });

  it("is deterministic and requires an explicit failure signal — never triggered implicitly", () => {
    const registry = createAgentRegistry([
      profile({ id: "low", effort: "low" }),
      profile({ id: "medium-a", effort: "medium" }),
      profile({ id: "medium-b", effort: "medium" }),
    ]);

    const runOnce = () =>
      escalateAgentProfile({
        registry,
        request: { requiredCapabilities: ["code_edit"], requiredPermissions: [] },
        previousProfileId: "low",
        failureReason: "runtime_error",
      });

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(first, second);
    assert.equal(first.outcome === "escalated" ? first.profile.id : null, "medium-a");
  });
});

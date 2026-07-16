import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAgentRegistry,
  DEFAULT_AGENT_PROFILES,
  defaultAgentRegistry,
  findAgentProfile,
} from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";

function fixtureProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture.profile",
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

describe("createAgentRegistry", () => {
  it("accepts profiles with unique ids", () => {
    const registry = createAgentRegistry([
      fixtureProfile({ id: "a" }),
      fixtureProfile({ id: "b" }),
    ]);

    assert.equal(registry.profiles.length, 2);
  });

  it("rejects duplicate profile ids", () => {
    assert.throws(
      () => createAgentRegistry([fixtureProfile({ id: "dup" }), fixtureProfile({ id: "dup" })]),
      /Duplicate agent profile id: dup/,
    );
  });
});

describe("findAgentProfile", () => {
  it("returns the matching profile", () => {
    const registry = createAgentRegistry([fixtureProfile({ id: "target" })]);

    assert.equal(findAgentProfile(registry, "target")?.id, "target");
  });

  it("returns null when no profile matches", () => {
    const registry = createAgentRegistry([fixtureProfile({ id: "target" })]);

    assert.equal(findAgentProfile(registry, "missing"), null);
  });
});

describe("defaultAgentRegistry", () => {
  it("has no duplicate ids", () => {
    const ids = DEFAULT_AGENT_PROFILES.map((profile) => profile.id);

    assert.equal(new Set(ids).size, ids.length);
  });

  it("covers more than one runtime and more than one effort level", () => {
    const runtimes = new Set(DEFAULT_AGENT_PROFILES.map((profile) => profile.runtime));
    const efforts = new Set(DEFAULT_AGENT_PROFILES.map((profile) => profile.effort));

    assert.ok(runtimes.size > 1);
    assert.ok(efforts.size > 1);
  });

  it("is queryable through findAgentProfile", () => {
    const first = DEFAULT_AGENT_PROFILES[0];
    assert.ok(first);
    assert.equal(findAgentProfile(defaultAgentRegistry, first.id)?.id, first.id);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAgentRegistry,
  defaultAgentRegistry,
} from "../../src/agents/registry.js";
import { escalateAgentProfile } from "../../src/agents/escalation.js";
import type { AgentProfile } from "../../src/agents/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { resolvePolicy } from "../../src/policy/resolver.js";

// Routing matrix (2026-08-22 policy fix). "High" is reserved for a
// demonstrated last resort (escalateAgentProfile, only reachable after a
// real prior attempt) — it must never be the static default for any
// category, however sensitive. See src/policy/resolver.ts
// (CATEGORY_MINIMUM_EFFORT) and src/agents/registry.ts
// (claude_code.medium) for the rules under test.
//
// Loop Engine's current classifier (classifyLoopTaskCategory) only knows
// documentation/code/tests/validation/architecture/review/none — there is
// no distinct "mechanical", "security", or "difficult diagnosis" category.
// Rows below map the doctrine's tiers onto the closest existing category:
// security-flavored architecture work is exercised via the "architecture"
// category (ADR/security text both match ARCHITECTURE_KEYWORDS), and
// "difficult diagnosis" is exercised via explicit escalation, the only
// mechanism that legitimately reaches "high".
//
// Architecture expresses a provider-independent "high_reasoning" preference.
// No default registry profile advertises that tier today, so the resolver
// reports an explicit fallback while still selecting the smallest profile
// satisfying the hard requirements.

function candidate(text: string): RoadmapCandidate {
  return {
    path: "docs/roadmap/loop-engine.md",
    line: 1,
    text,
    kind: "safe",
    reason: "fixture",
    status: "todo",
    priority: "default",
  };
}

function resolve(text: string | null) {
  return resolvePolicy({
    policy: DEFAULT_AGENT_POLICY,
    registry: defaultAgentRegistry,
    candidate: text === null ? null : candidate(text),
    mode: "plan",
  });
}

describe("generic model/effort routing matrix", () => {
  it("mechanical/read lot (default 'code' classification, no architecture keyword) never exceeds the cheapest capable profile", () => {
    const result = resolve("- [ ] Bump the lockfile and rerun ci");
    assert.equal(result.requirements.category, "code");
    assert.equal(result.selection?.outcome, "selected");
    assert.equal(
      result.selection?.outcome === "selected"
        ? result.selection.profile.effort
        : null,
      "low",
    );
  });

  it("normal development lot stays low/medium — never a static high", () => {
    const result = resolve("- [ ] Implement the export CSV button");
    assert.equal(result.requirements.category, "code");
    assert.equal(result.requirements.minimumEffort, "medium");
    assert.equal(
      result.selection?.outcome === "selected"
        ? result.selection.profile.effort
        : null,
      "low",
    );
  });

  it("moderate bug/diagnosis lot ('tests' category) stays at medium, not high", () => {
    const result = resolve(
      "- [ ] Add regression tests for the flaky retry bug",
    );
    assert.equal(result.requirements.category, "tests");
    assert.equal(result.requirements.minimumEffort, "medium");
    assert.notEqual(
      result.selection?.outcome === "selected"
        ? result.selection.profile.effort
        : null,
      "high",
    );
  });

  it("architecture/security-flavored lot resolves to claude-sonnet-5 at effort medium, never a static high", () => {
    const result = resolve(
      "- [ ] ADR architecture du cockpit : frontière sécurité et accès VPS",
    );
    assert.equal(result.requirements.category, "architecture");
    assert.equal(result.requirements.minimumEffort, "medium");
    assert.equal(result.selection?.outcome, "selected");
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.model, "claude-sonnet-5");
    assert.equal(profile?.effort, "medium");
    assert.equal(profile?.capabilities.includes("long_context"), true);
  });

  it("difficult diagnosis: 'high' is only reachable via explicit escalation from a real prior attempt", () => {
    const result = resolve(
      "- [ ] ADR architecture du cockpit : frontière sécurité et accès VPS",
    );
    assert.equal(result.selection?.outcome, "selected");
    const previous =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(previous?.id, "claude_code.medium");

    const escalation = escalateAgentProfile({
      registry: defaultAgentRegistry,
      request: result.selectionRequest!,
      previousProfileId: previous!.id,
      failureReason: "validation_failed",
    });

    assert.equal(escalation.outcome, "escalated");
    assert.equal(
      escalation.outcome === "escalated" ? escalation.profile.effort : null,
      "high",
    );
    assert.equal(
      escalation.outcome === "escalated" ? escalation.profile.model : null,
      "claude-sonnet-5",
    );
  });

  it("explicit last resort: an already-high profile only escalates to a strictly higher effort, never loops back to medium", () => {
    const escalation = escalateAgentProfile({
      registry: defaultAgentRegistry,
      request: {
        requiredCapabilities: ["code_edit", "long_context"],
        requiredPermissions: ["read_only"],
      },
      previousProfileId: "claude_code.high",
      failureReason: "runtime_error",
    });

    assert.equal(escalation.outcome, "exhausted");
  });
});

// Fixture-only profile that advertises the provider-independent doctrinal
// tier used by architecture. It is deliberately not part of
// defaultAgentRegistry: the test only proves that the policy recognizes the
// preference when a compatible profile carrying that tier is available.
function architecturePreferredProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id: "fixture.high-reasoning",
    runtime: "custom",
    provider: "local",
    model: "fixture-high-reasoning",
    effort: "medium",
    capabilities: ["code_edit", "shell_exec", "test_execution", "long_context"],
    permissions: ["read_only", "write_worktree", "shell_exec", "git_commit"],
    tiers: ["high_reasoning"],
    budget: {
      maxTokens: 150_000,
      maxCostUsd: 4,
      maxDurationMs: 300_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
    ...overrides,
  };
}

describe("policy target vs. resolved profile — fallback", () => {
  it("architecture declares a preferred profile id that is not registered today", () => {
    const result = resolve("- [ ] Revoir l'architecture du runner");
    assert.equal(result.requirements.preferredCapabilityTier, "high_reasoning");
  });

  it("architecture with the preferred profile unavailable: resolves to the best compatible profile, fallback active with a stable reason", () => {
    const result = resolve("- [ ] Revoir l'architecture du runner");
    assert.equal(result.status, "resolved");
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.id, "claude_code.medium");
    assert.equal(result.fallback.active, true);
    assert.equal(
      result.fallback.reason,
      "preferred_capability_tier_unavailable",
    );
  });

  it("architecture with the preferred profile available and compatible: it is selected, fallback inactive", () => {
    // A minimal registry (not defaultAgentRegistry) where the preferred
    // profile is the only one satisfying architecture's requirements —
    // isolates "is the preference honored when available" from
    // pickSmallestCapable's cheapest-first tie-breaking against
    // claude_code.medium, which is a separate, real registry-availability
    // fact covered by the "unavailable" test below.
    const registryWithPreferred = createAgentRegistry([
      defaultAgentRegistry.profiles.find((p) => p.id === "claude_code.low")!,
      architecturePreferredProfile(),
    ]);

    const result = resolvePolicy({
      policy: DEFAULT_AGENT_POLICY,
      registry: registryWithPreferred,
      candidate: candidate("- [ ] Revoir l'architecture du runner"),
      mode: "plan",
    });

    assert.equal(result.status, "resolved");
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.id, "fixture.high-reasoning");
    assert.equal(result.fallback.active, false);
    assert.equal(result.fallback.reason, null);
  });

  it("a preferred profile that exists but does not satisfy a hard requirement is never selected just to avoid a fallback (requirements stay fail-closed)", () => {
    const registryWithIncompatiblePreferred = createAgentRegistry([
      ...defaultAgentRegistry.profiles,
      // Declares the preferred id but is missing long_context — a real,
      // required capability for "architecture" — so it must never win.
      architecturePreferredProfile({ capabilities: ["code_edit"] }),
    ]);

    const result = resolvePolicy({
      policy: DEFAULT_AGENT_POLICY,
      registry: registryWithIncompatiblePreferred,
      candidate: candidate("- [ ] Revoir l'architecture du runner"),
      mode: "plan",
    });

    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.notEqual(profile?.id, "fixture.high-reasoning");
    assert.equal(profile?.id, "claude_code.medium");
    assert.equal(result.fallback.active, true);
  });

  it("categories without a declared preference never report an artificial fallback", () => {
    for (const text of [
      "- [ ] Bump the lockfile and rerun ci", // code
      "- [ ] Rédiger la documentation du module policy", // documentation
      "- [ ] Add regression tests for the flaky retry bug", // tests
      "- [ ] Renforcer l'audit et la validation", // validation
      "- [ ] Review the last release", // review
    ]) {
      const result = resolve(text);
      assert.equal(
        result.requirements.preferredCapabilityTier,
        undefined,
        text,
      );
      assert.equal(result.fallback.active, false, text);
      assert.equal(result.fallback.reason, null, text);
    }
  });

  it("fallback and escalation are distinct: a fallback never bumps effort, and escalation is never triggered by an unavailable preference", () => {
    const result = resolve("- [ ] Revoir l'architecture du runner");
    assert.equal(result.fallback.active, true);
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    // The fallback resolved to claude_code.medium — the same effort tier
    // the category requires — never escalating to "high" on its own.
    assert.equal(profile?.effort, "medium");

    // Escalation is a separate, opt-in call that requires a real prior
    // profile and failure reason; resolvePolicy itself never calls it.
    const escalation = escalateAgentProfile({
      registry: defaultAgentRegistry,
      request: result.selectionRequest!,
      previousProfileId: profile!.id,
      failureReason: "validation_failed",
    });
    assert.equal(escalation.outcome, "escalated");
    assert.equal(
      escalation.outcome === "escalated" ? escalation.profile.effort : null,
      "high",
    );
  });
});

describe("H4-L1 (lp-infra) — real routing regression", () => {
  const H4_L1_TEXT =
    "| H4-L1 | [P1] ADR architecture du cockpit : responsabilités, frontière sécurité, accès VPS/services, modèle read-only vs actions et choix technologique minimal ; aucune implémentation avant ADR accepté | ⬜ À faire |";

  it("no longer recommends Sonnet + High without an explicit justification", () => {
    const result = resolve(H4_L1_TEXT);
    assert.equal(result.requirements.category, "architecture");
    assert.equal(result.status, "resolved");
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.provider, "anthropic");
    assert.equal(profile?.model, "claude-sonnet-5");
    assert.notEqual(profile?.effort, "high");
    assert.equal(profile?.effort, "medium");
  });

  it("the context budget is a bounded ceiling, not an artificial 40000-token floor", () => {
    const result = resolve(H4_L1_TEXT);
    assert.equal(result.requirements.contextBudget.maxEstimatedTokens, 15_000);
    assert.notEqual(
      result.requirements.contextBudget.maxEstimatedTokens,
      40_000,
    );
  });

  it("reports an explicit, stable fallback reason instead of silently redefining the doctrine", () => {
    const result = resolve(H4_L1_TEXT);
    assert.equal(result.requirements.preferredCapabilityTier, "high_reasoning");
    assert.equal(result.fallback.active, true);
    assert.equal(
      result.fallback.reason,
      "preferred_capability_tier_unavailable",
    );
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.id, "claude_code.medium");
  });
});

describe("context budget: ceiling vs. actual estimate", () => {
  it("a small real context (well under the ceiling) does not push minimumEffort up", () => {
    // H4-L1's real bounded context is ~3642 estimated tokens (2 files:
    // ADR/0007-architecture-cockpit.md, docs/roadmap/projet-lp-infra.md) —
    // far below both the medium (15000) and the former high (40000)
    // ceiling. The ceiling is a maximum, never a target to fill.
    const result = resolve(
      "| H4-L1 | ADR architecture du cockpit | ⬜ À faire |",
    );
    const estimatedRealTokens = 3642;
    assert.ok(
      estimatedRealTokens <
        result.requirements.contextBudget.maxEstimatedTokens,
    );
    assert.equal(result.requirements.minimumEffort, "medium");
  });

  it("a generous budget ceiling does not itself force a higher effort profile", () => {
    // claude_code.medium's own budget.maxTokens (150000) is far above the
    // 15000-token context ceiling for medium effort; that headroom alone
    // must not bump the selected profile's effort.
    const result = resolve("- [ ] Revoir l'architecture du runner");
    const profile =
      result.selection?.outcome === "selected"
        ? result.selection.profile
        : null;
    assert.equal(profile?.effort, "medium");
    assert.ok(
      (profile?.budget.maxTokens ?? 0) >
        result.requirements.contextBudget.maxEstimatedTokens,
    );
  });
});

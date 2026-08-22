import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultAgentRegistry } from "../../src/agents/registry.js";
import { escalateAgentProfile } from "../../src/agents/escalation.js";
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
// Opus is not integrated in Loop Engine today: the Anthropic pricing table
// (src/text-only-provider/pricing.ts) explicitly has no entry for
// "claude-opus-5" (resolveAnthropicPricing returns null for it, see
// tests/text-only-provider/pricing.test.ts). Adding it is out of scope for
// this lot — no compatible, priced Opus profile exists to route to, so
// "architecture"/"security" resolve to the cheapest capable Anthropic
// profile instead: claude-sonnet-5 at effort medium.

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
      result.selection?.outcome === "selected" ? result.selection.profile.effort : null,
      "low",
    );
  });

  it("normal development lot stays low/medium — never a static high", () => {
    const result = resolve("- [ ] Implement the export CSV button");
    assert.equal(result.requirements.category, "code");
    assert.equal(result.requirements.minimumEffort, "medium");
    assert.equal(
      result.selection?.outcome === "selected" ? result.selection.profile.effort : null,
      "low",
    );
  });

  it("moderate bug/diagnosis lot ('tests' category) stays at medium, not high", () => {
    const result = resolve("- [ ] Add regression tests for the flaky retry bug");
    assert.equal(result.requirements.category, "tests");
    assert.equal(result.requirements.minimumEffort, "medium");
    assert.notEqual(
      result.selection?.outcome === "selected" ? result.selection.profile.effort : null,
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
    const profile = result.selection?.outcome === "selected" ? result.selection.profile : null;
    assert.equal(profile?.model, "claude-sonnet-5");
    assert.equal(profile?.effort, "medium");
    assert.equal(profile?.capabilities.includes("long_context"), true);
  });

  it("difficult diagnosis: 'high' is only reachable via explicit escalation from a real prior attempt", () => {
    const result = resolve(
      "- [ ] ADR architecture du cockpit : frontière sécurité et accès VPS",
    );
    assert.equal(result.selection?.outcome, "selected");
    const previous = result.selection?.outcome === "selected" ? result.selection.profile : null;
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

describe("H4-L1 (lp-infra) — real routing regression", () => {
  const H4_L1_TEXT =
    "| H4-L1 | [P1] ADR architecture du cockpit : responsabilités, frontière sécurité, accès VPS/services, modèle read-only vs actions et choix technologique minimal ; aucune implémentation avant ADR accepté | ⬜ À faire |";

  it("no longer recommends Sonnet + High without an explicit justification", () => {
    const result = resolve(H4_L1_TEXT);
    assert.equal(result.requirements.category, "architecture");
    assert.equal(result.status, "resolved");
    const profile = result.selection?.outcome === "selected" ? result.selection.profile : null;
    assert.equal(profile?.provider, "anthropic");
    assert.equal(profile?.model, "claude-sonnet-5");
    assert.notEqual(profile?.effort, "high");
    assert.equal(profile?.effort, "medium");
  });

  it("the context budget is a bounded ceiling, not an artificial 40000-token floor", () => {
    const result = resolve(H4_L1_TEXT);
    assert.equal(result.requirements.contextBudget.maxEstimatedTokens, 15_000);
    assert.notEqual(result.requirements.contextBudget.maxEstimatedTokens, 40_000);
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
    assert.ok(estimatedRealTokens < result.requirements.contextBudget.maxEstimatedTokens);
    assert.equal(result.requirements.minimumEffort, "medium");
  });

  it("a generous budget ceiling does not itself force a higher effort profile", () => {
    // claude_code.medium's own budget.maxTokens (150000) is far above the
    // 15000-token context ceiling for medium effort; that headroom alone
    // must not bump the selected profile's effort.
    const result = resolve("- [ ] Revoir l'architecture du runner");
    const profile = result.selection?.outcome === "selected" ? result.selection.profile : null;
    assert.equal(profile?.effort, "medium");
    assert.ok((profile?.budget.maxTokens ?? 0) > result.requirements.contextBudget.maxEstimatedTokens);
  });
});

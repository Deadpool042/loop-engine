import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAgentRegistry,
  defaultAgentRegistry,
} from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import {
  classifyLoopTaskCategory,
  deriveRequiredPermissions,
  resolvePolicy,
} from "../../src/policy/resolver.js";
import type { AgentPolicy } from "../../src/policy/types.js";
import { AGENT_POLICY_MODES } from "../../src/policy/types.js";

function candidate(
  overrides: Partial<RoadmapCandidate> = {},
): RoadmapCandidate {
  return {
    path: "docs/roadmap/loop-engine.md",
    line: 1,
    text: "- [ ] Some micro-lot",
    kind: "safe",
    reason: "no sensitive keyword detected",
    status: "todo",
    priority: "default",
    ...overrides,
  };
}

function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return { ...DEFAULT_AGENT_POLICY, ...overrides };
}

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture",
    runtime: "custom",
    provider: "local",
    model: "fixture-model",
    effort: "low",
    // Matches the "code" category's required capabilities (see
    // CATEGORY_CAPABILITIES in src/policy/resolver.ts) since most fixtures
    // below use a candidate that classifies as "code".
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
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

describe("classifyLoopTaskCategory — deterministic keyword deduction", () => {
  it("deduces a documentation lot", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({ text: "- [ ] Rédiger la documentation du module policy" }),
      ),
      "documentation",
    );
  });

  it("deduces a code lot (no keyword match, default)", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({
          text: "- [ ] Lot V7.4 — Agent Policy Engine et intégration",
        }),
      ),
      "code",
    );
  });

  it("deduces a tests lot", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({ text: "- [ ] Add tests for the policy resolver" }),
      ),
      "tests",
    );
  });

  it("deduces a validation lot", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({ text: "- [ ] Renforcer l'audit et la validation" }),
      ),
      "validation",
    );
  });

  it("deduces an architecture lot", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({ text: "- [ ] Revoir l'architecture du runner" }),
      ),
      "architecture",
    );
  });

  it("deduces a review-only lot", () => {
    assert.equal(
      classifyLoopTaskCategory(
        candidate({ text: "- [ ] Review the last release" }),
      ),
      "review",
    );
  });

  it("deduces none when there is no candidate", () => {
    assert.equal(classifyLoopTaskCategory(null), "none");
  });

  it("ignores candidate.path — the roadmap file's own location never drives classification", () => {
    // Every candidate in this repo shares the same roadmap path
    // (docs/roadmap/loop-engine.md), which itself lives under docs/. If path
    // were inspected, every lot would be misclassified as documentation.
    assert.notEqual(
      classifyLoopTaskCategory(
        candidate({
          path: "docs/roadmap/loop-engine.md",
          text: "- [ ] Refactor the selector",
        }),
      ),
      "documentation",
    );
  });
});

describe("deriveRequiredPermissions — mode ceiling always wins over category needs", () => {
  it("no write capability in mode plan, regardless of category", () => {
    for (const category of [
      "documentation",
      "code",
      "tests",
      "validation",
      "architecture",
      "review",
    ] as const) {
      const permissions = deriveRequiredPermissions(category, "plan");
      assert.ok(!permissions.includes("write_worktree"));
      assert.deepEqual(permissions, ["read_only"]);
    }
  });

  it("no commit permission in mode execute", () => {
    assert.ok(
      !deriveRequiredPermissions("code", "execute").includes("git_commit"),
    );
  });

  it("no push permission in mode commit", () => {
    assert.ok(
      !deriveRequiredPermissions("code", "commit").includes("git_push"),
    );
    assert.ok(
      deriveRequiredPermissions("code", "commit").includes("git_commit"),
    );
  });

  it("push is only ever requested in mode publish", () => {
    for (const mode of AGENT_POLICY_MODES) {
      assert.equal(
        deriveRequiredPermissions("code", mode).includes("git_push"),
        mode === "publish",
      );
    }
  });

  it("git_tag is never derived from any category/mode combination — always separate, never implicit", () => {
    for (const category of [
      "documentation",
      "code",
      "tests",
      "validation",
      "architecture",
      "review",
      "none",
    ] as const) {
      for (const mode of AGENT_POLICY_MODES) {
        assert.ok(
          !deriveRequiredPermissions(category, mode).includes("git_tag"),
        );
      }
    }
  });

  it("a review/validation lot never requests write_worktree, even in execute mode", () => {
    assert.ok(
      !deriveRequiredPermissions("review", "execute").includes(
        "write_worktree",
      ),
    );
    assert.ok(
      !deriveRequiredPermissions("validation", "execute").includes(
        "write_worktree",
      ),
    );
  });
});

describe("resolvePolicy — gates, in order", () => {
  it("returns policy_disabled and attempts no selection when the policy is disabled", () => {
    const result = resolvePolicy({
      policy: policy({ enabled: false }),
      registry: defaultAgentRegistry,
      candidate: candidate(),
      mode: "plan",
    });

    assert.equal(result.status, "policy_disabled");
    assert.equal(result.selection, null);
  });

  it("returns no_safe_candidate when there is no candidate", () => {
    const result = resolvePolicy({
      policy: policy(),
      registry: defaultAgentRegistry,
      candidate: null,
      mode: "plan",
    });

    assert.equal(result.status, "no_safe_candidate");
    assert.equal(result.selection, null);
  });

  it("effort maximum is never exceeded: a lot needing more than the policy allows is rejected", () => {
    const result = resolvePolicy({
      policy: policy({ maximumEffort: "low" }),
      registry: createAgentRegistry([
        profile({ id: "p", effort: "max", capabilities: ["long_context"] }),
      ]),
      candidate: candidate({ text: "- [ ] Revoir l'architecture globale" }), // category "architecture" -> minimumEffort "high"
      mode: "plan",
    });

    assert.equal(result.status, "effort_not_supported");
  });

  it("provider_not_allowed when the restrictive provider merge leaves nothing", () => {
    const result = resolvePolicy({
      policy: policy({ allowedProviders: ["anthropic"] }),
      registry: defaultAgentRegistry,
      candidate: candidate(),
      mode: "plan",
      request: { requestedProviders: ["openai"] },
    });

    assert.equal(result.status, "provider_not_allowed");
  });

  it("runtime_not_allowed when the restrictive runtime merge leaves nothing", () => {
    const result = resolvePolicy({
      policy: policy({ allowedRuntimes: ["claude_code"] }),
      registry: defaultAgentRegistry,
      candidate: candidate(),
      mode: "plan",
      request: { requestedRuntimes: ["codex"] },
    });

    assert.equal(result.status, "runtime_not_allowed");
  });

  it("permission_denied when the policy explicitly denies a required permission, even though a capable profile exists", () => {
    const registry = createAgentRegistry([
      profile({
        id: "capable",
        permissions: ["read_only", "write_worktree", "shell_exec"],
      }),
    ]);

    const result = resolvePolicy({
      policy: policy({ deniedPermissions: ["write_worktree"] }),
      registry,
      candidate: candidate({ text: "- [ ] Implement the new feature" }), // category "code" -> needs write in execute
      mode: "execute",
    });

    assert.equal(result.status, "permission_denied");
    assert.equal(result.selection, null);
  });

  it("no_compatible_agent when a profile has the capability but lacks the required permission", () => {
    const registry = createAgentRegistry([
      profile({ id: "capable-no-perm", permissions: [] }),
    ]);

    const result = resolvePolicy({
      policy: policy(),
      registry,
      candidate: candidate({ text: "- [ ] Implement the new feature" }),
      mode: "plan",
    });

    assert.equal(result.status, "no_compatible_agent");
    assert.equal(result.selection?.outcome, "no_match");
  });

  it("no_compatible_agent when the registry has no profile at all", () => {
    const result = resolvePolicy({
      policy: policy(),
      registry: createAgentRegistry([]),
      candidate: candidate(),
      mode: "plan",
    });

    assert.equal(result.status, "no_compatible_agent");
  });

  it("budget_exhausted when a real mode's merged budget allows zero calls", () => {
    const registry = createAgentRegistry([profile({ id: "any" })]);

    const result = resolvePolicy({
      policy: policy(),
      registry,
      candidate: candidate({ text: "- [ ] Implement the new feature" }),
      mode: "execute",
      request: { requestedBudget: { maxCalls: 0 } },
    });

    assert.equal(result.status, "budget_exhausted");
  });

  it("resolves with a forecast selection in mode plan — a compatible agent is found without being called", () => {
    const registry = createAgentRegistry([
      profile({ id: "forecastable", effort: "medium" }),
    ]);

    const result = resolvePolicy({
      policy: policy(),
      registry,
      candidate: candidate({ text: "- [ ] Implement the new feature" }),
      mode: "plan",
    });

    assert.equal(result.status, "resolved");
    assert.equal(result.selection?.outcome, "selected");
    assert.equal(result.mode, "plan");
    // The run's own budget for mode plan is still 0 real calls — the forecast
    // never implies an actual invocation.
    assert.equal(result.requirements.executionBudget.maxCalls, 0);
  });

  it("every resolution carries at least one human-readable reason", () => {
    const outcomes = [
      resolvePolicy({
        policy: policy({ enabled: false }),
        registry: defaultAgentRegistry,
        candidate: candidate(),
        mode: "plan",
      }),
      resolvePolicy({
        policy: policy(),
        registry: defaultAgentRegistry,
        candidate: null,
        mode: "plan",
      }),
      resolvePolicy({
        policy: policy(),
        registry: defaultAgentRegistry,
        candidate: candidate(),
        mode: "plan",
      }),
    ];

    for (const outcome of outcomes) {
      assert.ok(outcome.reasons.length > 0);
      assert.ok(outcome.reasons.every((reason) => reason.length > 0));
    }
  });

  it("is deterministic: repeated calls with the same input produce the same status and selection", () => {
    const registry = createAgentRegistry([profile({ id: "stable" })]);
    const input = {
      policy: policy(),
      registry,
      candidate: candidate({ text: "- [ ] Implement the new feature" }),
      mode: "plan" as const,
    };

    const runs = Array.from({ length: 5 }, () => resolvePolicy(input));

    for (const run of runs) {
      assert.equal(run.status, runs[0]!.status);
      assert.deepEqual(
        run.selection?.outcome === "selected" ? run.selection.profile.id : null,
        runs[0]!.selection?.outcome === "selected"
          ? runs[0]!.selection.profile.id
          : null,
      );
    }
  });
});

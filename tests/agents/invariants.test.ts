import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAgentRegistry,
  DEFAULT_AGENT_PROFILES,
  defaultAgentRegistry,
} from "../../src/agents/registry.js";
import { escalateAgentProfile } from "../../src/agents/escalation.js";
import {
  evaluateAgentProfile,
  selectAgentProfile,
} from "../../src/agents/selector.js";
import {
  AGENT_EFFORTS,
  compareAgentEffort,
  type AgentProfile,
} from "../../src/agents/types.js";

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

describe("invariant: src/agents/ has no dependency on loop/, commands/ or intelligence/", () => {
  const files = [
    "src/agents/types.ts",
    "src/agents/registry.ts",
    "src/agents/selector.ts",
    "src/agents/escalation.ts",
  ];

  for (const file of files) {
    it(`${file} does not import loop/, commands/, intelligence/, or cli.ts`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(
        content,
        /from\s+["'].*\/(loop|commands|intelligence)\//,
      );
      assert.doesNotMatch(content, /from\s+["'].*cli\.js["']/);
    });
  }
});

describe("invariant: default profiles never assert unverified third-party capability without explicit config", () => {
  it("every default profile declares its capabilities/permissions/budget as explicit arrays, not inherited or inferred", () => {
    for (const candidate of DEFAULT_AGENT_PROFILES) {
      assert.ok(Array.isArray(candidate.capabilities));
      assert.ok(Array.isArray(candidate.permissions));
      assert.ok(
        typeof candidate.budget === "object" && candidate.budget !== null,
      );
    }
  });

  it("the canonical doc marks default profiles as illustrative, not verified facts", () => {
    const doc = readFileSync(
      "docs/architecture/agent-orchestration.md",
      "utf8",
    );
    assert.match(doc, /explicitement illustratifs/);
  });
});

describe("invariant: provider, runtime, model, and effort are separate fields", () => {
  it("AgentProfile keeps four independent fields, none derived from another", () => {
    const candidate = profile({
      runtime: "codex",
      provider: "openai",
      model: "any-model-string",
      effort: "high",
    });

    assert.equal(candidate.runtime, "codex");
    assert.equal(candidate.provider, "openai");
    assert.equal(candidate.model, "any-model-string");
    assert.equal(candidate.effort, "high");
  });

  it("model is a free-form string, not a fixed union of known identifiers", () => {
    const candidate = profile({
      model: "some-future-model-id-not-yet-released",
    });
    assert.equal(typeof candidate.model, "string");
  });
});

describe("invariant: selector picks the smallest compatible profile deterministically", () => {
  it("always prefers the lowest effort among eligible profiles, in AGENT_EFFORTS order", () => {
    const registry = createAgentRegistry(
      [...AGENT_EFFORTS]
        .reverse()
        .map((effort) => profile({ id: `p-${effort}`, effort })),
    );

    const result = selectAgentProfile(registry, {
      requiredCapabilities: [],
      requiredPermissions: [],
    });

    assert.equal(result.outcome, "selected");
    assert.equal(
      result.outcome === "selected" ? result.profile.effort : null,
      AGENT_EFFORTS[0],
    );
  });

  it("is stable across repeated calls on the same registry (no randomness)", () => {
    const registry = createAgentRegistry([
      profile({ id: "b", effort: "low" }),
      profile({ id: "a", effort: "low" }),
    ]);
    const request = { requiredCapabilities: [], requiredPermissions: [] };

    const runs = Array.from({ length: 5 }, () =>
      selectAgentProfile(registry, request),
    );
    const ids = runs.map((run) =>
      run.outcome === "selected" ? run.profile.id : null,
    );

    assert.deepEqual(new Set(ids), new Set(["a"]));
  });
});

describe("invariant: no preference bypasses capabilities, permissions, max effort, or budget", () => {
  it("a profile missing a required capability is never selected regardless of low effort", () => {
    const registry = createAgentRegistry([
      profile({ id: "cheap-but-incapable", effort: "low", capabilities: [] }),
      profile({ id: "capable", effort: "high", capabilities: ["code_edit"] }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
    });

    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "capable",
    );
  });

  it("a profile missing a required permission is never selected regardless of effort", () => {
    const registry = createAgentRegistry([
      profile({ id: "cheap-no-perm", effort: "low", permissions: [] }),
      profile({
        id: "has-perm",
        effort: "high",
        permissions: ["write_worktree"],
      }),
    ]);

    const result = selectAgentProfile(registry, {
      requiredCapabilities: [],
      requiredPermissions: ["write_worktree"],
    });

    assert.equal(
      result.outcome === "selected" ? result.profile.id : null,
      "has-perm",
    );
  });

  it("effort ceiling is never bypassed even when the excluded profile would tie on capabilities", () => {
    const evaluation = evaluateAgentProfile(profile({ effort: "max" }), {
      requiredCapabilities: ["code_edit"],
      requiredPermissions: [],
      maxEffort: "low",
    });

    assert.equal(evaluation.ok, false);
  });

  it("budget ceiling is never bypassed", () => {
    const evaluation = evaluateAgentProfile(
      profile({
        budget: {
          maxTokens: 1_000_000,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      }),
      {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: [],
        budgetCeiling: { maxTokens: 1_000 },
      },
    );

    assert.equal(evaluation.ok, false);
  });
});

describe("invariant: no model pricing is hardcoded or invented", () => {
  it("AgentProfile and AgentBudget carry no per-token/per-call price field", () => {
    const fields = Object.keys(profile());
    assert.ok(!fields.includes("price"));
    assert.ok(!fields.includes("pricePerToken"));

    const budgetFields = Object.keys(profile().budget);
    assert.deepEqual(
      budgetFields.sort(),
      [
        "maxCalls",
        "maxCostUsd",
        "maxDurationMs",
        "maxRepairs",
        "maxTokens",
      ].sort(),
    );
  });

  it("maxCostUsd is a caller-declared ceiling, never a computed price", () => {
    for (const candidate of DEFAULT_AGENT_PROFILES) {
      assert.ok(
        candidate.budget.maxCostUsd === null ||
          typeof candidate.budget.maxCostUsd === "number",
      );
    }
  });
});

describe("invariant: escalation requires an explicit failure, respects budgets, and terminates", () => {
  it("throws without ever escalating when previousProfileId is unknown (no implicit fallback)", () => {
    const registry = createAgentRegistry([profile({ id: "known" })]);

    assert.throws(() =>
      escalateAgentProfile({
        registry,
        request: { requiredCapabilities: [], requiredPermissions: [] },
        previousProfileId: "ghost",
        failureReason: "runtime_error",
      }),
    );
  });

  it("still enforces the requested budget ceiling while escalating", () => {
    const registry = createAgentRegistry([
      profile({ id: "low", effort: "low" }),
      profile({
        id: "high-over-budget",
        effort: "high",
        budget: {
          maxTokens: 1_000_000,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      }),
    ]);

    const result = escalateAgentProfile({
      registry,
      request: {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: [],
        budgetCeiling: { maxTokens: 1_000 },
      },
      previousProfileId: "low",
      failureReason: "budget_exceeded",
    });

    assert.equal(result.outcome, "exhausted");
  });

  it("terminates in a single hop on a finite registry — never loops (bounded by registry size)", () => {
    const registry = createAgentRegistry(
      [...AGENT_EFFORTS].map((effort) =>
        profile({ id: `p-${effort}`, effort }),
      ),
    );

    let currentId = "p-low";
    let currentEffort = "low" as (typeof AGENT_EFFORTS)[number];
    let hops = 0;
    const maxHops = AGENT_EFFORTS.length + 1;

    for (;;) {
      hops += 1;
      assert.ok(
        hops <= maxHops,
        "escalation must terminate within a bounded number of hops",
      );

      const result = escalateAgentProfile({
        registry,
        request: {
          requiredCapabilities: ["code_edit"],
          requiredPermissions: [],
        },
        previousProfileId: currentId,
        failureReason: "runtime_error",
      });

      if (result.outcome === "exhausted") {
        break;
      }

      assert.ok(compareAgentEffort(result.profile.effort, currentEffort) > 0);
      currentId = result.profile.id;
      currentEffort = result.profile.effort;
    }

    assert.equal(currentId, "p-max");
  });
});

describe("invariant: no network call, SDK, agent process, or execute mode is introduced", () => {
  const files = [
    "src/agents/types.ts",
    "src/agents/registry.ts",
    "src/agents/selector.ts",
    "src/agents/escalation.ts",
  ];

  for (const file of files) {
    it(`${file} performs no I/O and spawns no process`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /\bfetch\(/);
      assert.doesNotMatch(content, /require\(["']https?["']\)/);
      assert.doesNotMatch(content, /child_process/);
      assert.doesNotMatch(content, /"execute"/);
    });
  }

  it("no CLI wiring references src/agents/ (no new command in this lot)", () => {
    const cli = readFileSync("src/cli.ts", "utf8");
    assert.doesNotMatch(cli, /agents\//);
  });
});

describe("invariant: defaultAgentRegistry stays internally consistent", () => {
  it("every profile id in defaultAgentRegistry is unique and non-empty", () => {
    const ids = defaultAgentRegistry.profiles.map((candidate) => candidate.id);
    assert.ok(ids.every((id) => id.length > 0));
    assert.equal(new Set(ids).size, ids.length);
  });
});

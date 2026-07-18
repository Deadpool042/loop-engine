import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_PERMISSIONS,
  UNBOUNDED_AGENT_BUDGET,
  type AgentBudget,
} from "../../src/agents/types.js";
import {
  DEFAULT_MODE_BUDGETS,
  getAllowedPermissionsForMode,
  getForecastSelectionBudgetForMode,
  getContextBudgetForEffort,
  mergeAllowedProviders,
  mergeAllowedRuntimes,
  mergeBudgetsRestrictively,
  mergeContextBudgetsRestrictively,
  restrictMaximumEffort,
  toBudget,
} from "../../src/policy/defaults.js";
import { AGENT_POLICY_MODES } from "../../src/policy/types.js";

describe("getAllowedPermissionsForMode", () => {
  it("plan grants only read_only — no write capability in mode plan", () => {
    assert.deepEqual(getAllowedPermissionsForMode("plan"), ["read_only"]);
  });

  it("execute never grants git_commit", () => {
    assert.ok(!getAllowedPermissionsForMode("execute").includes("git_commit"));
    assert.ok(
      getAllowedPermissionsForMode("execute").includes("write_worktree"),
    );
  });

  it("commit never grants git_push", () => {
    assert.ok(!getAllowedPermissionsForMode("commit").includes("git_push"));
    assert.ok(getAllowedPermissionsForMode("commit").includes("git_commit"));
  });

  it("push is grantable only in mode publish", () => {
    for (const mode of AGENT_POLICY_MODES) {
      const allowed = getAllowedPermissionsForMode(mode);
      assert.equal(allowed.includes("git_push"), mode === "publish");
    }
  });

  it("git_tag is never part of any mode ceiling — distinct from git_push, never implicit", () => {
    for (const mode of AGENT_POLICY_MODES) {
      assert.ok(!getAllowedPermissionsForMode(mode).includes("git_tag"));
    }
  });

  it("every mode's ceiling only uses declared AgentPermission values", () => {
    for (const mode of AGENT_POLICY_MODES) {
      for (const permission of getAllowedPermissionsForMode(mode)) {
        assert.ok(
          (AGENT_PERMISSIONS as readonly string[]).includes(permission),
        );
      }
    }
  });

  it("each mode's ceiling is a strict superset of the previous mode's — plan ⊆ execute ⊆ commit ⊆ publish", () => {
    const order = ["plan", "execute", "commit", "publish"] as const;

    for (let i = 1; i < order.length; i += 1) {
      const previous = getAllowedPermissionsForMode(order[i - 1]!);
      const current = getAllowedPermissionsForMode(order[i]!);
      assert.ok(previous.every((permission) => current.includes(permission)));
      assert.ok(current.length > previous.length);
    }
  });
});

describe("DEFAULT_MODE_BUDGETS", () => {
  it("plan mode's own budget allows zero agent calls, by design", () => {
    assert.equal(DEFAULT_MODE_BUDGETS.plan.maxCalls, 0);
    assert.equal(DEFAULT_MODE_BUDGETS.plan.maxRepairs, 0);
  });

  it("execute/commit/publish share a conservative single-call default", () => {
    for (const mode of ["execute", "commit", "publish"] as const) {
      assert.equal(DEFAULT_MODE_BUDGETS[mode].maxCalls, 1);
    }
  });
});

describe("getForecastSelectionBudgetForMode — a compatibility simulation, never an executable authorization", () => {
  it("simulates mode execute for a plan forecast (never gates the preview on plan's own 0-call budget)", () => {
    assert.deepEqual(
      getForecastSelectionBudgetForMode("plan"),
      DEFAULT_MODE_BUDGETS.execute,
    );
  });

  it("matches the mode's own default for execute/commit/publish", () => {
    for (const mode of ["execute", "commit", "publish"] as const) {
      assert.deepEqual(
        getForecastSelectionBudgetForMode(mode),
        DEFAULT_MODE_BUDGETS[mode],
      );
    }
  });
});

function budget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return { ...UNBOUNDED_AGENT_BUDGET, ...overrides };
}

describe("mergeBudgetsRestrictively", () => {
  it("takes the minimum of global and requested on every dimension", () => {
    const merged = mergeBudgetsRestrictively(
      budget({ maxTokens: 100_000, maxCalls: 5 }),
      budget({ maxTokens: 10_000, maxCalls: 10 }),
    );

    assert.equal(merged.maxTokens, 10_000);
    assert.equal(merged.maxCalls, 5);
  });

  it("a null (unbounded) global never widens a bounded request beyond the request itself", () => {
    const merged = mergeBudgetsRestrictively(
      budget({ maxTokens: null }),
      budget({ maxTokens: 1_000 }),
    );
    assert.equal(merged.maxTokens, 1_000);
  });

  it("a null (unbounded) requested value defers to the global bound, never becomes unlimited", () => {
    const merged = mergeBudgetsRestrictively(
      budget({ maxTokens: 1_000 }),
      budget({ maxTokens: null }),
    );
    assert.equal(merged.maxTokens, 1_000);
  });

  it("both null stays null (still explicitly unbounded, not accidentally so)", () => {
    const merged = mergeBudgetsRestrictively(
      budget({ maxTokens: null }),
      budget({ maxTokens: null }),
    );
    assert.equal(merged.maxTokens, null);
  });

  it("never produces a result looser than either input on any dimension", () => {
    const global = budget({
      maxTokens: 500,
      maxCostUsd: 2,
      maxDurationMs: 60_000,
      maxCalls: 3,
      maxRepairs: 1,
    });
    const requested = budget({
      maxTokens: 2_000,
      maxCostUsd: 1,
      maxDurationMs: 120_000,
      maxCalls: 1,
      maxRepairs: 5,
    });
    const merged = mergeBudgetsRestrictively(global, requested);

    for (const dimension of [
      "maxTokens",
      "maxCostUsd",
      "maxDurationMs",
      "maxCalls",
      "maxRepairs",
    ] as const) {
      assert.ok(merged[dimension]! <= global[dimension]!);
      assert.ok(merged[dimension]! <= requested[dimension]!);
    }
  });
});

describe("toBudget", () => {
  it("fills every omitted dimension with null instead of defaulting to unlimited surprises", () => {
    const result = toBudget({ maxTokens: 500 });
    assert.equal(result.maxTokens, 500);
    assert.equal(result.maxCostUsd, null);
    assert.equal(result.maxDurationMs, null);
    assert.equal(result.maxCalls, null);
    assert.equal(result.maxRepairs, null);
  });

  it("an empty partial budget merges as a full no-op against any global budget", () => {
    const global = budget({ maxTokens: 10, maxCalls: 1 });
    const merged = mergeBudgetsRestrictively(global, toBudget({}));
    assert.deepEqual(merged, global);
  });
});

describe("mergeAllowedProviders / mergeAllowedRuntimes — restrictive intersection, never widened", () => {
  it("requested providers narrow the global list to their intersection", () => {
    const result = mergeAllowedProviders(
      ["anthropic", "openai"],
      ["openai", "google"],
    );
    assert.deepEqual(result, ["openai"]);
  });

  it("a requested provider outside the global allow-list is dropped, never added", () => {
    const result = mergeAllowedProviders(
      ["anthropic"],
      ["anthropic", "openai"],
    );
    assert.deepEqual(result, ["anthropic"]);
  });

  it("undefined on one side defers entirely to the other side", () => {
    assert.deepEqual(mergeAllowedProviders(undefined, ["anthropic"]), [
      "anthropic",
    ]);
    assert.deepEqual(mergeAllowedProviders(["anthropic"], undefined), [
      "anthropic",
    ]);
    assert.equal(mergeAllowedProviders(undefined, undefined), undefined);
  });

  it("runtimes follow the same restrictive-intersection rule", () => {
    const result = mergeAllowedRuntimes(
      ["claude_code", "codex"],
      ["codex", "gemini_cli"],
    );
    assert.deepEqual(result, ["codex"]);
  });
});

describe("restrictMaximumEffort — effort ceiling is never exceeded", () => {
  it("a lower requested max effort is honored", () => {
    assert.equal(restrictMaximumEffort("high", "low"), "low");
  });

  it("a higher requested max effort is clamped down to the global ceiling", () => {
    assert.equal(restrictMaximumEffort("low", "max"), "low");
  });

  it("no request defers to the global ceiling", () => {
    assert.equal(restrictMaximumEffort("medium", undefined), "medium");
  });
});

describe("context budget by effort", () => {
  it("is always bounded — no effort level produces an unlimited context budget", () => {
    for (const effort of ["low", "medium", "high", "xhigh", "max"] as const) {
      const contextBudget = getContextBudgetForEffort(effort);
      assert.ok(Number.isFinite(contextBudget.maxFiles));
      assert.ok(Number.isFinite(contextBudget.maxCharacters));
      assert.ok(Number.isFinite(contextBudget.maxEstimatedTokens));
    }
  });

  it("mergeContextBudgetsRestrictively takes the minimum on every numeric dimension", () => {
    const merged = mergeContextBudgetsRestrictively(
      {
        maxFiles: 10,
        maxCharacters: 1_000,
        maxEstimatedTokens: 500,
        includeFullFiles: true,
      },
      {
        maxFiles: 2,
        maxCharacters: 5_000,
        maxEstimatedTokens: 100,
        includeFullFiles: false,
      },
    );

    assert.equal(merged.maxFiles, 2);
    assert.equal(merged.maxCharacters, 1_000);
    assert.equal(merged.maxEstimatedTokens, 100);
    assert.equal(merged.includeFullFiles, false);
  });
});

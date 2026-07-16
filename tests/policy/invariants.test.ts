import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { resolvePolicy } from "../../src/policy/resolver.js";

const POLICY_FILES = ["src/policy/types.ts", "src/policy/defaults.ts", "src/policy/resolver.ts"];

describe("invariant: src/policy/ never depends on src/loop/, src/commands/, or src/cli.ts", () => {
  for (const file of POLICY_FILES) {
    it(`${file} does not import loop/, commands/, or cli.ts`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /from\s+["'].*\/(loop|commands)\//);
      assert.doesNotMatch(content, /from\s+["'].*cli\.js["']/);
    });
  }
});

describe("invariant: src/agents/ never depends on src/policy/ (dependency direction stays policy -> agents)", () => {
  const agentFiles = ["src/agents/types.ts", "src/agents/registry.ts", "src/agents/selector.ts", "src/agents/escalation.ts"];

  for (const file of agentFiles) {
    it(`${file} does not import policy/`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /from\s+["'].*\/policy\//);
    });
  }
});

describe("invariant: no network call, SDK, agent process, or execute mode is introduced by the policy engine", () => {
  for (const file of POLICY_FILES) {
    it(`${file} performs no I/O and spawns no process`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /\bfetch\(/);
      assert.doesNotMatch(content, /require\(["']https?["']\)/);
      assert.doesNotMatch(content, /child_process/);
    });
  }

  it("no CLI wiring references src/policy/ outside the LoopRunner integration", () => {
    const cli = readFileSync("src/cli.ts", "utf8");
    assert.doesNotMatch(cli, /policy\//);
  });
});

describe("invariant: no automatic escalation loop is introduced by the policy engine", () => {
  it("resolver.ts never calls escalateAgentProfile — escalation stays a separate, explicitly-triggered concern", () => {
    const content = readFileSync("src/policy/resolver.ts", "utf8");
    assert.doesNotMatch(content, /escalateAgentProfile/);
  });
});

describe("invariant: no force-push, no automatic tag creation, git_tag stays separate from git_push", () => {
  for (const file of POLICY_FILES) {
    it(`${file} never mentions a force push`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /--force/);
      assert.doesNotMatch(content, /push\s+--force/);
    });
  }

  it("AgentPolicy.allowTagCreation is a distinct, opt-in field — never inferred from git_push", () => {
    const content = readFileSync("src/policy/types.ts", "utf8");
    assert.match(content, /allowTagCreation\?:\s*boolean/);
  });
});

describe("invariant: resolvePolicy never invokes a real agent — it only ever reads local, in-memory data", () => {
  it("resolving the same forecast twice in mode plan never mutates the registry or produces a side effect", () => {
    const profile: AgentProfile = {
      id: "fixture",
      runtime: "custom",
      provider: "local",
      model: "fixture-model",
      effort: "low",
      capabilities: ["code_edit"],
      permissions: ["read_only", "write_worktree", "shell_exec"],
      budget: { maxTokens: null, maxCostUsd: null, maxDurationMs: null, maxCalls: 1, maxRepairs: 1 },
    };
    const registry = createAgentRegistry([profile]);
    const before = JSON.stringify(registry);

    resolvePolicy({
      policy: DEFAULT_AGENT_POLICY,
      registry,
      candidate: {
        path: "docs/roadmap/loop-engine.md",
        line: 1,
        text: "- [ ] Implement something",
        kind: "safe",
        reason: "no sensitive keyword detected",
        status: "todo",
        priority: "default",
      },
      mode: "plan",
    });

    assert.equal(JSON.stringify(registry), before);
  });
});

describe("invariant: the plan-mode forecast budget never authorizes a real call", () => {
  it("executionBudget.maxCalls stays 0, a forecast selection can still be computed, and no network call is ever made", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("resolvePolicy must never perform network I/O");
    }) as typeof fetch;

    const registry = createAgentRegistry([
      {
        id: "fixture",
        runtime: "custom",
        provider: "local",
        model: "fixture-model",
        effort: "low",
        capabilities: ["code_edit", "shell_exec", "test_execution"],
        permissions: ["read_only", "write_worktree", "shell_exec"],
        budget: { maxTokens: null, maxCostUsd: null, maxDurationMs: null, maxCalls: 1, maxRepairs: 1 },
      },
    ]);

    let result;

    try {
      result = resolvePolicy({
        policy: DEFAULT_AGENT_POLICY,
        registry,
        candidate: {
          path: "docs/roadmap/loop-engine.md",
          line: 1,
          text: "- [ ] Implement something",
          kind: "safe",
          reason: "no sensitive keyword detected",
          status: "todo",
          priority: "default",
        },
        mode: "plan",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // (1) the run's own budget never authorizes a call, even though a
    // compatible agent was forecast.
    assert.equal(result.requirements.executionBudget.maxCalls, 0);
    // (2) a forecast selection can still be computed — the preview is not
    // vacuous.
    assert.equal(result.status, "resolved");
    assert.equal(result.selection?.outcome, "selected");
    // (3) producing that forecast made zero network calls. No executor, no
    // external process, and no provider SDK is reachable either: resolver.ts
    // and its dependency closure (src/agents/, src/intelligence/roadmap.ts,
    // src/policy/defaults.ts) statically never reference child_process,
    // require("http"/"https"), or any provider SDK — see the "no network
    // call, SDK, agent process, or execute mode" describe block above and
    // tests/agents/invariants.test.ts for the equivalent static check on
    // src/agents/.
    assert.equal(fetchCalls, 0);
  });
});

describe("invariant: DEFAULT_AGENT_POLICY is internally consistent and enabled by default", () => {
  it("has a non-empty id and is enabled", () => {
    assert.ok(DEFAULT_AGENT_POLICY.id.length > 0);
    assert.equal(DEFAULT_AGENT_POLICY.enabled, true);
  });

  it("never carries a price field — no model pricing is hardcoded or invented", () => {
    const fields = Object.keys(DEFAULT_AGENT_POLICY);
    assert.ok(!fields.includes("price"));
    assert.ok(!fields.includes("pricePerToken"));
  });
});

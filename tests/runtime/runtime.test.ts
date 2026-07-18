import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ClaudeRuntime,
  CodexRuntime,
  OpenClawRuntime,
  RUNTIME_REGISTRY,
  selectRuntime,
  type RuntimeRequest,
} from "../../src/runtime/index.js";
import type { AgentProfile, AgentRuntime } from "../../src/agents/types.js";

function runtimeRequest(runtime: AgentRuntime = "codex"): RuntimeRequest {
  const providerByRuntime = {
    claude_code: "anthropic",
    codex: "openai",
    openclaw: "local",
  } as const;
  const provider = providerByRuntime[runtime as keyof typeof providerByRuntime];
  assert.ok(provider, `fixture provider required for ${runtime}`);

  const profile: AgentProfile = {
    id: `fixture.${runtime}`,
    runtime,
    provider,
    model: "fixture-model",
    effort: "medium",
    capabilities: ["code_edit"],
    permissions: ["read_only"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };

  return {
    task: {
      path: "docs/roadmap/runtime.md",
      line: 1,
      text: "- [ ] Runtime abstraction",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    mode: "plan",
    contextPackage: {
      project: "fixture",
      budget: {
        maxFiles: 1,
        maxCharacters: 100,
        maxEstimatedTokens: 25,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    resolvedAgentPolicy: {
      policyId: "fixture-policy",
      mode: "plan",
      status: "resolved",
      requirements: {
        category: "code",
        mode: "plan",
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only"],
        minimumEffort: "low",
        maximumEffort: "high",
        contextBudget: {
          maxFiles: 1,
          maxCharacters: 100,
          maxEstimatedTokens: 25,
          includeFullFiles: false,
        },
        executionBudget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: 0,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only"],
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    provider,
    effort: "medium",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "fixture-request" },
  };
}

describe("runtime stubs", () => {
  const adapters = [OpenClawRuntime, ClaudeRuntime, CodexRuntime];

  for (const adapter of adapters) {
    it(`${adapter.runtimeId} is deterministic and never executes a task`, () => {
      const request = runtimeRequest(adapter.runtimeId);
      assert.equal(adapter.supports(request), true);
      assert.deepEqual(adapter.capabilities, []);
      assert.deepEqual(adapter.execute(request), {
        runtimeId: adapter.runtimeId,
        status: "not_implemented",
        startedAt: request.requestedAt,
        completedAt: request.requestedAt,
        diagnostics: [`Runtime ${adapter.runtimeId} is not implemented.`],
        output: null,
        metadata: request.metadata,
      });
    });
  }
});

describe("runtime registry and selector", () => {
  it("has static deterministic declaration order", () => {
    assert.deepEqual(
      RUNTIME_REGISTRY.adapters.map((adapter) => adapter.runtimeId),
      ["openclaw", "claude_code", "codex", "local-process"],
    );
  });

  it("selects the policy runtime deterministically without scoring", () => {
    const request = runtimeRequest("codex");
    const first = selectRuntime(request);
    const second = selectRuntime(request);

    assert.equal(first.outcome, "selected");
    assert.equal(second.outcome, "selected");
    if (first.outcome === "selected" && second.outcome === "selected") {
      assert.equal(first.adapter.runtimeId, "codex");
      assert.equal(second.adapter.runtimeId, first.adapter.runtimeId);
    }
  });

  it("honors explicit provider/runtime restrictions and reports unsupported runtimes", () => {
    const request = runtimeRequest("codex");

    assert.deepEqual(
      selectRuntime({ ...request, allowedProviders: ["local"] }),
      {
        outcome: "unsupported",
        reason: "runtime codex does not support the resolved request",
      },
    );
    assert.deepEqual(
      selectRuntime({ ...request, allowedRuntimes: ["openclaw"] }),
      {
        outcome: "unsupported",
        reason: "runtime codex does not support the resolved request",
      },
    );
    assert.deepEqual(
      selectRuntime({ ...request, requestedRuntime: "custom" }),
      {
        outcome: "unsupported",
        reason: "runtime custom is not registered",
      },
    );
  });
});

describe("runtime invariants", () => {
  const runtimeFiles = [
    "src/runtime/types.ts",
    "src/runtime/result.ts",
    "src/runtime/openclaw.ts",
    "src/runtime/claude.ts",
    "src/runtime/codex.ts",
    "src/runtime/registry.ts",
    "src/runtime/selector.ts",
  ];

  for (const file of runtimeFiles) {
    it(`${file} has no network or process execution dependency`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\bfetch\(/);
      assert.doesNotMatch(source, /child_process/);
      assert.doesNotMatch(source, /\bspawn\(/);
      assert.doesNotMatch(source, /node:(http|https|net)/);
    });
  }
});

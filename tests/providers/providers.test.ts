import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createProviderExecutionPlan,
  createProviderRequest,
} from "../../src/core/index.js";
import {
  ClaudeCodeProviderAdapter,
  CodexProviderAdapter,
  getProviderAdapter,
  OpenClawProviderAdapter,
  PROVIDER_REGISTRY,
  selectProvider,
  type ProviderId,
  type ProviderRequest,
} from "../../src/providers/index.js";
import type {
  AgentCapability,
  AgentProfile,
  AgentRuntime,
} from "../../src/agents/types.js";
import type { RuntimeRequest } from "../../src/runtime/types.js";

const providerByRuntime = {
  openclaw: "local",
  claude_code: "anthropic",
  codex: "openai",
} as const;

function runtimeRequest(
  runtime: keyof typeof providerByRuntime = "codex",
  requiredCapabilities: readonly AgentCapability[] = [],
): RuntimeRequest {
  const provider = providerByRuntime[runtime];
  const profile: AgentProfile = {
    id: `provider.fixture.${runtime}`,
    runtime: runtime as AgentRuntime,
    provider,
    model: "fixture-model",
    effort: "medium",
    capabilities: [],
    permissions: ["read_only"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 0,
      maxRepairs: 0,
    },
  };

  return {
    task: {
      path: "docs/roadmap/providers.md",
      line: 1,
      text: "- [ ] Provider adapters",
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
      policyId: "provider-policy",
      mode: "plan",
      status: "resolved",
      requirements: {
        category: "none",
        mode: "plan",
        requiredCapabilities,
        requiredPermissions: ["read_only"],
        minimumEffort: "low",
        maximumEffort: "medium",
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
        requiredCapabilities: [],
        requiredPermissions: ["read_only"],
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    provider,
    effort: "medium",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "provider-fixture" },
  };
}

function providerRequest(
  runtime: keyof typeof providerByRuntime = "codex",
  requiredCapabilities: readonly AgentCapability[] = [],
): ProviderRequest {
  return createProviderRequest(runtimeRequest(runtime, requiredCapabilities));
}

describe("provider registry and deterministic selection", () => {
  it("uses a fixed unique declaration order", () => {
    const ids = PROVIDER_REGISTRY.adapters.map((adapter) => adapter.id);
    assert.deepEqual(ids, ["openclaw", "claude-code", "codex"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("looks up known providers and rejects unknown ids structurally", () => {
    assert.equal(getProviderAdapter("codex")?.id, "codex");
    assert.equal(getProviderAdapter("unknown" as ProviderId), null);

    assert.deepEqual(
      selectProvider({
        ...providerRequest(),
        requestedProvider: "unknown" as ProviderId,
      }),
      {
        outcome: "rejected",
        error: {
          code: "provider_not_found",
          message: "Provider unknown is not registered.",
          details: {},
          executionStarted: false,
        },
      },
    );
  });

  it("selects the compatible provider deterministically without scoring", () => {
    const request = providerRequest("codex");
    const first = selectProvider(request);
    const second = selectProvider(request);

    assert.equal(first.outcome, "selected");
    assert.equal(second.outcome, "selected");
    if (first.outcome === "selected" && second.outcome === "selected") {
      assert.equal(first.adapter.id, "codex");
      assert.equal(second.adapter.id, first.adapter.id);
    }
  });

  it("refuses a provider disallowed by policy and missing capabilities", () => {
    const policyRejected = selectProvider({
      ...providerRequest(),
      requestedProvider: "codex",
      runtimeRequest: {
        ...runtimeRequest(),
        allowedProviders: ["anthropic"],
      },
    });
    assert.equal(policyRejected.outcome, "rejected");
    if (policyRejected.outcome === "rejected") {
      assert.equal(policyRejected.error.code, "provider_not_allowed");
    }

    const capabilityRejected = selectProvider(
      providerRequest("codex", ["shell_exec"]),
    );
    assert.equal(capabilityRejected.outcome, "rejected");
    if (capabilityRejected.outcome === "rejected") {
      assert.equal(capabilityRejected.error.code, "capability_not_supported");
    }
  });
});

describe("provider stubs", () => {
  const fixtures = [
    [OpenClawProviderAdapter, providerRequest("openclaw")],
    [ClaudeCodeProviderAdapter, providerRequest("claude_code")],
    [CodexProviderAdapter, providerRequest("codex")],
  ] as const;

  for (const [adapter, request] of fixtures) {
    it(`${adapter.id} builds an inert not-implemented plan`, () => {
      assert.equal(adapter.supports(request), true);
      assert.deepEqual(adapter.capabilities, []);

      const plan = adapter.prepare(request);
      assert.equal(plan.status, "not_implemented");
      assert.equal(plan.transport, "not_configured");
      assert.equal(plan.error.code, "provider_not_implemented");
      assert.equal(plan.error.executionStarted, false);

      const unsupportedPlan = adapter.prepare({
        ...request,
        requiredCapabilities: ["shell_exec"],
      });
      assert.equal(unsupportedPlan.status, "unsupported");
      assert.equal(unsupportedPlan.error.code, "provider_not_supported");

      const normalized = adapter.normalize({
        status: "not_implemented",
        output: null,
        diagnostics: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        metadata: { fixture: true },
      });
      assert.equal(normalized.providerId, adapter.id);
      assert.equal(normalized.status, "not_implemented");
      assert.equal(normalized.output, null);
    });
  }
});

describe("Core provider integration", () => {
  it("builds a Core-only inert plan without changing the runtime request", () => {
    const runtime = runtimeRequest();
    const before = JSON.stringify(runtime);
    const request = createProviderRequest(runtime, {
      requestedProvider: "codex",
      metadata: { core: true },
    });
    const plan = createProviderExecutionPlan(request);

    assert.equal(plan.providerId, "codex");
    assert.equal(plan.status, "not_implemented");
    assert.equal(plan.error.code, "provider_not_implemented");
    assert.equal(JSON.stringify(runtime), before);
  });
});

describe("provider invariants", () => {
  const providerFiles = [
    "src/providers/types.ts",
    "src/providers/errors.ts",
    "src/providers/support.ts",
    "src/providers/registry.ts",
    "src/providers/selector.ts",
    "src/providers/openclaw.ts",
    "src/providers/claude-code.ts",
    "src/providers/codex.ts",
  ];

  for (const file of providerFiles) {
    it(`${file} stays inert with no process, network, secret, or environment access`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /child_process/);
      assert.doesNotMatch(source, /\bspawn\s*\(/);
      assert.doesNotMatch(source, /\bexec(?:File|Sync)?\s*\(/);
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /node:(http|https|net|tls)/);
      assert.doesNotMatch(source, /process\.env/);
    });
  }

  it("does not expose providers through CLI or LoopRunner", () => {
    assert.doesNotMatch(readFileSync("src/cli.ts", "utf8"), /providers\//);
    assert.doesNotMatch(
      readFileSync("src/loop/runner.ts", "utf8"),
      /providers\//,
    );
  });
});

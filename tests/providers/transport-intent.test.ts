import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createExecutableMappingRequest,
  createProviderExecutionPlan,
  createProviderRequest,
  createTransportIntent,
  createTransportIntentResult,
  normalizeTransportIntent,
  resolveTransportIntent,
  validateExecutableMapping,
  validateTransportIntent,
} from "../../src/core/index.js";
import {
  createTransportIntentError,
  createTransportIntentRegistry,
  OpenClawTransportIntent,
  selectTransportIntent,
  TRANSPORT_INTENT_REGISTRY,
  validateTransportIntent as validateWithRegistry,
  type TransportIntent,
  type TransportIntentPolicy,
} from "../../src/providers/intent/index.js";
import {
  createOpenClawProtocolPlan,
  normalizeOpenClawRequest,
} from "../../src/providers/openclaw/index.js";
import type { RuntimeRequest } from "../../src/runtime/index.js";

function runtimeRequest(): RuntimeRequest {
  const profile = {
    id: "intent.fixture",
    runtime: "openclaw" as const,
    provider: "local" as const,
    model: "fixture",
    effort: "low" as const,
    capabilities: [],
    permissions: ["read_only" as const],
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
      path: "docs/roadmap/intent.md",
      line: 6,
      text: "- [ ] Intent",
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
      policyId: "intent-policy",
      mode: "plan",
      status: "resolved",
      requirements: {
        category: "none",
        mode: "plan",
        requiredCapabilities: [],
        requiredPermissions: ["read_only"],
        allowedProviders: ["local"],
        allowedRuntimes: ["openclaw"],
        minimumEffort: "low",
        maximumEffort: "low",
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
    provider: "local",
    effort: "low",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "intent-fixture" },
    requestedRuntime: "openclaw",
    allowedProviders: ["local"],
    allowedRuntimes: ["openclaw"],
  };
}

function input(policy?: TransportIntentPolicy) {
  const providerRequest = createProviderRequest(runtimeRequest(), {
    requestedProvider: "openclaw",
  });
  const providerPlan = createProviderExecutionPlan(providerRequest);
  const mappingResult = validateExecutableMapping(
    createExecutableMappingRequest(providerPlan, {
      protocolPlan: createOpenClawProtocolPlan(
        normalizeOpenClawRequest(providerRequest),
      ),
      policy: { enabled: true, allowedMappingIds: ["openclaw-planning"] },
    }),
  );
  return createTransportIntent(providerPlan, mappingResult, { policy });
}

function activeIntent(
  overrides: Partial<TransportIntent> = {},
): TransportIntent {
  return Object.freeze({
    ...OpenClawTransportIntent,
    active: true,
    configured: false,
    ...overrides,
  });
}

describe("transport intent contracts", () => {
  it("registers one immutable inactive OpenClaw declaration", () => {
    assert.deepEqual(
      TRANSPORT_INTENT_REGISTRY.intents.map((intent) => intent.id),
      ["openclaw-plan"],
    );
    assert.equal(Object.isFrozen(OpenClawTransportIntent), true);
    assert.equal(OpenClawTransportIntent.active, false);
    assert.equal(OpenClawTransportIntent.configured, false);
    assert.equal(OpenClawTransportIntent.transportId, "local-process");
    assert.doesNotMatch(
      JSON.stringify(OpenClawTransportIntent),
      /command|args|binary|path|environment|credential/i,
    );
  });

  it("keeps registry construction deterministic and rejects duplicate ids", () => {
    assert.throws(() =>
      createTransportIntentRegistry([
        OpenClawTransportIntent,
        OpenClawTransportIntent,
      ]),
    );
  });

  it("selects OpenClaw deterministically while keeping it inactive and non-resolvable", () => {
    const request = input({
      enabled: true,
      allowedIntentIds: ["openclaw-plan"],
    });
    assert.deepEqual(
      selectTransportIntent(request),
      selectTransportIntent(request),
    );
    assert.equal(resolveTransportIntent(request).outcome, "rejected");
    const result = validateTransportIntent(request);
    assert.equal(result.status, "intent_disabled");
    assert.equal(result.executionStarted, false);
  });

  it("distinguishes missing, policy, and configuration states without execution", () => {
    const base = input({ enabled: true, allowedIntentIds: ["openclaw-plan"] });
    const registry = createTransportIntentRegistry([activeIntent()]);
    const missing = validateWithRegistry(
      { ...base, requestedIntent: "missing" as never },
      registry,
    );
    const denied = validateWithRegistry(
      {
        ...base,
        policy: { enabled: false, allowedIntentIds: ["openclaw-plan"] },
      },
      registry,
    );
    const unconfigured = validateWithRegistry(base, registry);
    assert.deepEqual(
      [missing, denied, unconfigured].map((result) => result.error.code),
      ["intent_missing", "intent_policy_denied", "intent_not_configured"],
    );
    assert.ok(
      [missing, denied, unconfigured].every(
        (result) => result.executionStarted === false,
      ),
    );
  });

  it("reports Provider, Runtime, mapping, and transport incompatibilities safely", () => {
    const base = input({ enabled: true, allowedIntentIds: ["openclaw-plan"] });
    const provider = selectTransportIntent({
      ...base,
      requestedIntent: "openclaw-plan",
      providerPlan: { ...base.providerPlan, providerId: "codex" },
    });
    const runtime = selectTransportIntent({
      ...base,
      requestedIntent: "openclaw-plan",
      providerPlan: { ...base.providerPlan, runtimeId: "codex" },
    });
    const mapping = selectTransportIntent({
      ...base,
      requestedIntent: "openclaw-plan",
      mappingResult: { ...base.mappingResult, mappingId: null },
    });
    const transportRegistry = createTransportIntentRegistry([
      activeIntent({
        requiredCapabilities: ["shell_exec"],
        supports: () => false,
      }),
    ]);
    const transport = selectTransportIntent(
      { ...base, requestedIntent: "openclaw-plan" },
      transportRegistry,
    );
    assert.deepEqual(
      [provider, runtime, mapping, transport].map((result) =>
        result.outcome === "rejected" ? result.error.code : "selected",
      ),
      [
        "intent_provider_mismatch",
        "intent_runtime_mismatch",
        "intent_mapping_mismatch",
        "intent_transport_mismatch",
      ],
    );
  });

  it("normalizes only a declarative result and never creates a transport request", () => {
    const request = input();
    const result = createTransportIntentResult(
      request,
      "intent_missing",
      createTransportIntentError("intent_missing", "Fixture intent is absent."),
    );
    const normalized = normalizeTransportIntent(result);
    assert.deepEqual(normalized, result);
    assert.equal(normalized.desiredTransport, "not_configured");
    assert.equal(normalized.executionStarted, false);
  });
});

describe("transport intent architecture invariants", () => {
  const intentFiles = [
    "src/providers/intent/types.ts",
    "src/providers/intent/errors.ts",
    "src/providers/intent/registry.ts",
    "src/providers/intent/selector.ts",
    "src/providers/intent/validation.ts",
    "src/providers/intent/support.ts",
    "src/providers/intent/index.ts",
  ];
  for (const file of intentFiles) {
    it(`${file} has no execution, command, or upper-layer surface`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|node:(http|https|net|tls)|process\.env/,
      );
      assert.doesNotMatch(
        source,
        /\bcommand\s*:|\bargs\s*:|executablePath|binaryPath|workingDirectory|processOptions/,
      );
      assert.doesNotMatch(
        source,
        /TransportRequest|createTransportRequest|resolveTransport\s*\(|executeTransport\s*\(/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(core|cli|commands|loop)\//);
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/transports\/(local-process|registry|selector)/,
      );
    });
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createExecutableMappingRequest,
  createProviderExecutionPlan,
  createProviderRequest,
  createExecutableMappingResult,
  resolveExecutableMapping,
  validateExecutableMapping,
} from "../../src/core/index.js";
import {
  createExecutableMappingError,
  createExecutableMappingRegistry,
  EXECUTABLE_MAPPING_REGISTRY,
  OpenClawExecutableMapping,
  selectExecutableMapping,
  validateExecutableMapping as validateWithRegistry,
  type ExecutableMapping,
  type ExecutableMappingPolicy,
} from "../../src/providers/mapping/index.js";
import {
  createOpenClawProtocolPlan,
  normalizeOpenClawRequest,
} from "../../src/providers/openclaw/index.js";
import type { RuntimeRequest } from "../../src/runtime/index.js";

function runtimeRequest(): RuntimeRequest {
  const profile = {
    id: "mapping.fixture",
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
      path: "docs/roadmap/mapping.md",
      line: 5,
      text: "- [ ] Mapping",
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
      policyId: "mapping-policy",
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
    metadata: { requestId: "mapping-fixture" },
    requestedRuntime: "openclaw",
    allowedProviders: ["local"],
    allowedRuntimes: ["openclaw"],
  };
}

function request(policy?: ExecutableMappingPolicy) {
  const providerRequest = createProviderRequest(runtimeRequest(), {
    requestedProvider: "openclaw",
  });
  const providerPlan = createProviderExecutionPlan(providerRequest);
  return createExecutableMappingRequest(providerPlan, {
    protocolPlan: createOpenClawProtocolPlan(
      normalizeOpenClawRequest(providerRequest),
    ),
    policy,
  });
}

function enabledMapping(
  overrides: Partial<ExecutableMapping> = {},
): ExecutableMapping {
  return Object.freeze({
    ...OpenClawExecutableMapping,
    enabled: true,
    configured: false,
    ...overrides,
  });
}

describe("executable mapping contracts", () => {
  it("registers exactly one immutable disabled OpenClaw capability declaration", () => {
    assert.deepEqual(
      EXECUTABLE_MAPPING_REGISTRY.mappings.map((mapping) => mapping.id),
      ["openclaw-planning"],
    );
    assert.equal(Object.isFrozen(OpenClawExecutableMapping), true);
    assert.equal(OpenClawExecutableMapping.enabled, false);
    assert.equal(OpenClawExecutableMapping.configured, false);
    assert.deepEqual(
      OpenClawExecutableMapping.requiredTransportCapabilities,
      [],
    );
    assert.doesNotMatch(
      JSON.stringify(OpenClawExecutableMapping),
      /command|executablePath|binaryPath|arguments/i,
    );
  });

  it("keeps registry construction deterministic and rejects duplicate mappings", () => {
    assert.throws(() =>
      createExecutableMappingRegistry([
        OpenClawExecutableMapping,
        OpenClawExecutableMapping,
      ]),
    );
  });

  it("resolves OpenClaw deterministically but reports its default disabled state", () => {
    const input = request({
      enabled: true,
      allowedMappingIds: ["openclaw-planning"],
    });
    const first = resolveExecutableMapping(input);
    const second = resolveExecutableMapping(input);
    assert.deepEqual(first, second);
    assert.equal(first.outcome, "resolved");
    assert.equal(validateExecutableMapping(input).status, "mapping_disabled");
    assert.equal(validateExecutableMapping(input).executionStarted, false);
  });

  it("distinguishes missing, invalid, policy, authorization, and configuration states", () => {
    const base = request({
      enabled: true,
      allowedMappingIds: ["openclaw-planning"],
    });
    const customRegistry = createExecutableMappingRegistry([enabledMapping()]);
    const missing = validateWithRegistry(
      { ...base, requestedMapping: "missing" as never },
      customRegistry,
    );
    const invalid = validateWithRegistry(
      { ...base, protocolPlan: undefined },
      customRegistry,
    );
    const denied = validateWithRegistry(
      {
        ...base,
        policy: { enabled: false, allowedMappingIds: ["openclaw-planning"] },
      },
      customRegistry,
    );
    const unauthorized = validateWithRegistry(
      { ...base, policy: { enabled: true, allowedMappingIds: [] } },
      customRegistry,
    );
    const unconfigured = validateWithRegistry(base, customRegistry);

    assert.deepEqual(
      [missing, invalid, denied, unauthorized, unconfigured].map(
        (result) => result.error.code,
      ),
      [
        "mapping_missing",
        "mapping_invalid",
        "mapping_policy_denied",
        "mapping_not_authorized",
        "mapping_not_configured",
      ],
    );
    assert.ok(
      [missing, invalid, denied, unauthorized, unconfigured].every(
        (result) => result.executionStarted === false,
      ),
    );
  });

  it("reports provider, runtime, and transport incompatibilities safely", () => {
    const base = request({
      enabled: true,
      allowedMappingIds: ["openclaw-planning"],
    });
    const providerMismatch = selectExecutableMapping({
      ...base,
      requestedMapping: "openclaw-planning",
      providerPlan: { ...base.providerPlan, providerId: "codex" },
    });
    const runtimeMismatch = selectExecutableMapping({
      ...base,
      requestedMapping: "openclaw-planning",
      providerPlan: { ...base.providerPlan, runtimeId: "codex" },
    });
    const transportRegistry = createExecutableMappingRegistry([
      enabledMapping({
        requiredTransportCapabilities: ["shell_exec"],
        supports: () => false,
      }),
    ]);
    const transportMismatch = selectExecutableMapping(
      { ...base, requestedMapping: "openclaw-planning" },
      transportRegistry,
    );
    assert.deepEqual(
      [providerMismatch, runtimeMismatch, transportMismatch].map((result) =>
        result.outcome === "rejected" ? result.error.code : "selected",
      ),
      [
        "mapping_provider_mismatch",
        "mapping_runtime_mismatch",
        "mapping_transport_mismatch",
      ],
    );
  });

  it("keeps Claude Code and Codex unmapped", () => {
    const base = request();
    for (const providerId of ["claude-code", "codex"] as const) {
      const result = selectExecutableMapping({
        ...base,
        providerPlan: { ...base.providerPlan, providerId },
      });
      assert.equal(result.outcome, "rejected");
      if (result.outcome === "rejected")
        assert.equal(result.error.code, "mapping_missing");
    }
  });

  it("provides Core-only request and result construction without a transport invocation", () => {
    const input = request();
    const result = createExecutableMappingResult(
      input,
      "mapping_missing",
      createExecutableMappingError(
        "mapping_missing",
        "Fixture mapping is absent.",
      ),
    );
    assert.equal(result.intent.executable, false);
    assert.equal(result.intent.transportId, "not_configured");
    assert.equal(result.executionStarted, false);
  });
});

describe("executable mapping architecture invariants", () => {
  const mappingFiles = [
    "src/providers/mapping/types.ts",
    "src/providers/mapping/errors.ts",
    "src/providers/mapping/registry.ts",
    "src/providers/mapping/selector.ts",
    "src/providers/mapping/validation.ts",
    "src/providers/mapping/support.ts",
    "src/providers/mapping/index.ts",
  ];

  for (const file of mappingFiles) {
    it(`${file} remains deterministic and has no execution surface`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /child_process/);
      assert.doesNotMatch(source, /\bspawn\s*\(/);
      assert.doesNotMatch(source, /\bexec(?:File|Sync)?\s*\(/);
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /node:(http|https|net|tls)/);
      assert.doesNotMatch(source, /process\.env/);
      assert.doesNotMatch(source, /\bcommand\s*:/);
      assert.doesNotMatch(source, /from\s+["'].*\/(cli|loop)\//);
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/transports\/(local-process|registry|selector)/,
      );
    });
  }
});

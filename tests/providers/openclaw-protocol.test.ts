import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createProviderRequest } from "../../src/core/index.js";
import {
  ClaudeCodeProviderAdapter,
  CodexProviderAdapter,
  OpenClawProviderAdapter,
} from "../../src/providers/index.js";
import {
  createOpenClawProtocolPlan,
  createOpenClawProtocolResponse,
  normalizeOpenClawRequest,
  OPENCLAW_OPERATION_REGISTRY,
  OPENCLAW_OPERATIONS,
  OPENCLAW_PROTOCOL_VERSIONS,
  validateOpenClawProtocolRequest,
  type OpenClawRequest,
} from "../../src/providers/openclaw/index.js";
import type { RuntimeRequest } from "../../src/runtime/index.js";

function runtimeRequest(): RuntimeRequest {
  const profile = {
    id: "openclaw.protocol.fixture",
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
      path: "docs/roadmap/openclaw.md",
      line: 4,
      text: "- [ ] OpenClaw protocol",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    mode: "plan",
    contextPackage: {
      project: "fixture",
      budget: {
        maxFiles: 2,
        maxCharacters: 200,
        maxEstimatedTokens: 50,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    resolvedAgentPolicy: {
      policyId: "openclaw-protocol-policy",
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
          maxFiles: 2,
          maxCharacters: 200,
          maxEstimatedTokens: 50,
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
    metadata: { requestId: "openclaw-protocol-fixture" },
    requestedRuntime: "openclaw",
    allowedProviders: ["local"],
    allowedRuntimes: ["openclaw"],
  };
}

function providerRequest() {
  return createProviderRequest(runtimeRequest(), {
    requestedProvider: "openclaw",
  });
}

function validRequest(): OpenClawRequest {
  return normalizeOpenClawRequest(providerRequest());
}

describe("OpenClaw internal protocol contract", () => {
  it("uses a static Loop Engine planning schema and a single justified operation", () => {
    assert.deepEqual(OPENCLAW_PROTOCOL_VERSIONS, [
      "loop-engine-openclaw-planning/v1",
    ]);
    assert.deepEqual(OPENCLAW_OPERATIONS, ["plan"]);
    assert.deepEqual(OPENCLAW_OPERATION_REGISTRY, [
      {
        operation: "plan",
        requiredProviderCapabilities: [],
        requiredAgentPermissions: ["read_only"],
        requiredRuntimeCapabilities: [],
        requiredTransportCapabilities: [],
        protocolValid: true,
        executable: false,
      },
    ]);
  });

  it("normalizes a deterministic safe envelope without task or context content", () => {
    const first = validRequest();
    const second = validRequest();

    assert.deepEqual(first, second);
    assert.equal(first.protocolVersion, "loop-engine-openclaw-planning/v1");
    assert.equal(first.operation, "plan");
    assert.equal(first.input.taskId, "docs/roadmap/openclaw.md:4");
    assert.deepEqual(first.metadata, {
      correlationId: "openclaw-protocol-fixture",
    });
    assert.doesNotMatch(JSON.stringify(first), /OpenClaw protocol/);
  });

  it("rejects missing and unsupported protocol versions deterministically", () => {
    const missing = validateOpenClawProtocolRequest({
      ...validRequest(),
      protocolVersion: "",
    });
    assert.equal(missing.valid, false);
    assert.equal(missing.error?.code, "openclaw_protocol_version_missing");

    const unsupported = validateOpenClawProtocolRequest({
      ...validRequest(),
      protocolVersion: "unsupported/v9",
    });
    assert.equal(unsupported.valid, false);
    assert.equal(
      unsupported.error?.code,
      "openclaw_protocol_version_unsupported",
    );
  });

  it("rejects missing and unsupported operations deterministically", () => {
    const missing = validateOpenClawProtocolRequest({
      ...validRequest(),
      operation: "",
    });
    assert.equal(missing.error?.code, "openclaw_operation_missing");

    const unsupported = validateOpenClawProtocolRequest({
      ...validRequest(),
      operation: "edit",
    });
    assert.equal(unsupported.error?.code, "openclaw_operation_unsupported");
  });

  it("checks identity, context, capability, permission, runtime, and transport compatibility", () => {
    const base = validRequest();
    const cases: readonly [OpenClawRequest, string][] = [
      [{ ...base, provider: "openai" }, "openclaw_request_invalid"],
      [{ ...base, runtimeId: "codex" }, "openclaw_runtime_not_supported"],
      [
        {
          ...base,
          input: {
            ...base.input,
            context: { ...base.input.context, projectId: "other" },
          },
        },
        "openclaw_context_invalid",
      ],
      [
        { ...base, requiredProviderCapabilities: ["shell_exec"] },
        "openclaw_capability_not_supported",
      ],
      [{ ...base, requiredPermissions: [] }, "openclaw_permission_denied"],
      [
        { ...base, requiredTransportCapabilities: ["shell_exec"] },
        "openclaw_transport_not_supported",
      ],
    ];

    for (const [request, code] of cases) {
      const result = validateOpenClawProtocolRequest(request);
      assert.equal(result.valid, false);
      assert.equal(result.error?.code, code);
      assert.equal(result.error?.executionStarted, false);
    }
  });

  it("rejects secret-like, command-like, and environment-like metadata safely", () => {
    for (const metadata of [
      { accessToken: "hidden" },
      { command: "undocumented" },
      { environment: { KEY: "value" } },
    ]) {
      const result = validateOpenClawProtocolRequest({
        ...validRequest(),
        metadata,
      });
      assert.equal(result.error?.code, "openclaw_request_invalid");
      assert.doesNotMatch(
        JSON.stringify(result.diagnostics),
        /hidden|value|undocumented/,
      );
    }
  });

  it("creates a valid but non-executable plan and stable response", () => {
    const plan = createOpenClawProtocolPlan(validRequest());
    const response = createOpenClawProtocolResponse(plan);

    assert.equal(plan.status, "valid_non_executable");
    assert.equal(plan.validation.valid, true);
    assert.equal(plan.executionIntent.executable, false);
    assert.equal(plan.executionIntent.executableMapping, "absent");
    assert.equal(plan.error.code, "openclaw_executable_mapping_missing");
    assert.equal(plan.error.executionStarted, false);
    assert.equal(response.plan, plan);
    assert.equal(response.error.code, plan.error.code);
  });
});

describe("OpenClaw Provider adapter regression", () => {
  it("uses the protocol plan but remains inert and never marks a plan ready", () => {
    const request = providerRequest();
    const plan = OpenClawProviderAdapter.prepare(request);

    assert.equal(plan.status, "not_implemented");
    assert.equal(plan.transport, "not_configured");
    assert.equal(plan.transportIntent, undefined);
    assert.equal(plan.error.code, "provider_not_implemented");
    assert.deepEqual(plan.metadata.openclawProtocol, {
      version: "loop-engine-openclaw-planning/v1",
      operation: "plan",
      status: "valid_non_executable",
      executable: false,
      errorCode: "openclaw_executable_mapping_missing",
    });
    assert.ok(
      plan.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "openclaw_executable_mapping_missing",
      ),
    );
  });

  it("keeps Claude Code and Codex as unchanged inert stubs", () => {
    const claude = ClaudeCodeProviderAdapter.prepare({
      ...providerRequest(),
      requestedProvider: "claude-code",
      runtimeRequest: {
        ...runtimeRequest(),
        provider: "anthropic",
        requestedRuntime: "claude_code",
      },
    });
    const codex = CodexProviderAdapter.prepare({
      ...providerRequest(),
      requestedProvider: "codex",
      runtimeRequest: {
        ...runtimeRequest(),
        provider: "openai",
        requestedRuntime: "codex",
      },
    });

    assert.equal(claude.status, "unsupported");
    assert.equal(codex.status, "unsupported");
    assert.equal(claude.transportIntent, undefined);
    assert.equal(codex.transportIntent, undefined);
  });
});

describe("OpenClaw protocol architecture invariants", () => {
  const protocolFiles = [
    "src/providers/openclaw/types.ts",
    "src/providers/openclaw/protocol.ts",
    "src/providers/openclaw/diagnostics.ts",
    "src/providers/openclaw/normalization.ts",
    "src/providers/openclaw/validation.ts",
    "src/providers/openclaw/planning.ts",
  ];

  for (const file of protocolFiles) {
    it(`${file} remains local, pure, and below Provider`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/(core|transports|commands|loop)\//,
      );
      assert.doesNotMatch(source, /child_process/);
      assert.doesNotMatch(source, /\bspawn\s*\(/);
      assert.doesNotMatch(source, /\bexec(?:File|Sync)?\s*\(/);
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /node:(http|https|net|tls)/);
      assert.doesNotMatch(source, /process\.env/);
    });
  }

  it("keeps OpenClaw protocol out of runtime, transport, CLI, and LoopRunner", () => {
    for (const file of [
      "src/runtime/local-process.ts",
      "src/transports/local-process.ts",
      "src/cli.ts",
      "src/loop/runner.ts",
    ]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /openclaw\/index/);
    }
  });
});

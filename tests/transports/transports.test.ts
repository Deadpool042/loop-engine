import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createProviderExecutionPlan,
  createProviderRequest,
  createTransportAdapterRequest,
  executeProviderPlan,
  executeTransport,
  normalizeProviderTransportResult,
  resolveTransport,
} from "../../src/core/index.js";
import type { ProviderExecutionPlan } from "../../src/providers/index.js";
import type {
  LocalProcessExecutionPolicy,
  RuntimeRequest,
} from "../../src/runtime/index.js";
import {
  getTransportAdapter,
  LocalProcessTransport,
  selectTransport,
  TRANSPORT_REGISTRY,
  type TransportExecutionPolicy,
  type TransportId,
  type TransportAdapterRequest,
  type TransportResult,
} from "../../src/transports/index.js";

function projectRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "loop-transport-")));
}

function localProcessPolicy(root: string): LocalProcessExecutionPolicy {
  return {
    enabled: true,
    projectRoot: root,
    allowedExecutables: [process.execPath],
    allowedEnvironmentKeys: [],
    timeoutMs: 2_000,
    maxStdoutBytes: 1_024,
    maxStderrBytes: 1_024,
  };
}

function transportPolicy(
  overrides: Partial<TransportExecutionPolicy> = {},
): TransportExecutionPolicy {
  return {
    enabled: true,
    allowedTransportIds: ["local-process"],
    ...overrides,
  };
}

function runtimeRequest(root: string): RuntimeRequest {
  const permissions = ["read_only", "shell_exec"] as const;
  const profile = {
    id: "transport.fixture",
    runtime: "custom" as const,
    provider: "local" as const,
    model: "fixture",
    effort: "low" as const,
    capabilities: ["shell_exec" as const],
    permissions,
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
      path: "docs/roadmap/transports.md",
      line: 1,
      text: "- [ ] Transport adapters",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    mode: "execute",
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
      policyId: "transport-policy",
      mode: "execute",
      status: "resolved",
      requirements: {
        category: "validation",
        mode: "execute",
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: permissions,
        allowedProviders: ["local"],
        allowedRuntimes: ["local-process"],
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
          maxCalls: 1,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: permissions,
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    provider: "local",
    effort: "low",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "transport-fixture" },
    requestedRuntime: "local-process",
    allowedProviders: ["local"],
    allowedRuntimes: ["local-process"],
  };
}

function transportRequest(
  root: string,
  options: Readonly<{
    policy?: TransportExecutionPolicy;
    args?: readonly string[];
    requiredCapabilities?: readonly ("shell_exec" | "code_edit")[];
    runtime?: RuntimeRequest;
  }> = {},
): TransportAdapterRequest {
  return {
    transportId: "local-process",
    providerId: "fixture-provider",
    provider: "local",
    runtimeId: "local-process",
    requiredCapabilities: options.requiredCapabilities ?? ["shell_exec"],
    command: {
      executable: process.execPath,
      args: options.args ?? ["-e", "process.stdout.write('transport-ok')"],
      cwd: root,
    },
    localProcessPolicy: localProcessPolicy(root),
    transportPolicy: options.policy ?? transportPolicy(),
    runtimeRequest: options.runtime ?? runtimeRequest(root),
    metadata: { transportRequestId: "transport-fixture" },
  };
}

function providerStubPlan(): ProviderExecutionPlan {
  const root = projectRoot();
  try {
    const request = {
      ...runtimeRequest(root),
      mode: "plan" as const,
      requestedRuntime: "openclaw" as const,
      resolvedAgentPolicy: {
        ...runtimeRequest(root).resolvedAgentPolicy,
        mode: "plan" as const,
        requirements: {
          ...runtimeRequest(root).resolvedAgentPolicy.requirements,
          mode: "plan" as const,
          requiredCapabilities: [],
          requiredPermissions: ["read_only"],
        },
        selection: {
          outcome: "selected" as const,
          profile: {
            ...runtimeRequest(root).resolvedAgentPolicy.selection!.profile,
            runtime: "openclaw" as const,
            permissions: ["read_only"],
            capabilities: [],
          },
          rejected: [],
        },
      },
    };
    return createProviderExecutionPlan(
      createProviderRequest(request, { requestedProvider: "openclaw" }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("transport registry and selection", () => {
  it("registers exactly one deterministic transport with a unique id", () => {
    const ids = TRANSPORT_REGISTRY.adapters.map((adapter) => adapter.id);
    assert.deepEqual(ids, ["local-process"]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(getTransportAdapter("local-process")?.id, "local-process");
    assert.equal(getTransportAdapter("unknown" as TransportId), null);
  });

  it("selects the explicit transport deterministically and rejects unknown ids", () => {
    const root = projectRoot();
    try {
      const request = transportRequest(root);
      assert.equal(selectTransport(request).outcome, "selected");
      assert.equal(selectTransport(request).outcome, "selected");

      const unknown = selectTransport({
        ...request,
        transportId: "unknown" as TransportId,
      });
      assert.equal(unknown.outcome, "rejected");
      if (unknown.outcome === "rejected") {
        assert.equal(unknown.error.code, "transport_not_found");
        assert.equal(unknown.error.executionStarted, false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires explicit transport, runtime, and capability authorization", () => {
    const root = projectRoot();
    try {
      const disabled = selectTransport(
        transportRequest(root, { policy: transportPolicy({ enabled: false }) }),
      );
      assert.equal(disabled.outcome, "rejected");
      if (disabled.outcome === "rejected") {
        assert.equal(disabled.error.code, "transport_disabled");
      }

      const capability = selectTransport(
        transportRequest(root, { requiredCapabilities: ["code_edit"] }),
      );
      assert.equal(capability.outcome, "rejected");
      if (capability.outcome === "rejected") {
        assert.equal(capability.error.code, "capability_not_supported");
      }

      const runtime = runtimeRequest(root);
      const restricted = selectTransport(
        transportRequest(root, {
          runtime: { ...runtime, allowedRuntimes: [] },
        }),
      );
      assert.equal(restricted.outcome, "rejected");
      if (restricted.outcome === "rejected") {
        assert.equal(restricted.error.code, "transport_not_allowed");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("LocalProcessTransport", () => {
  it("delegates structured arguments to V10.1 and preserves events", async () => {
    const root = projectRoot();
    try {
      const request = transportRequest(root, {
        args: [
          "-e",
          "process.stdout.write(process.argv[1]); process.stderr.write('warn')",
          "with spaces && not-a-shell-operator",
        ],
      });
      const result = await executeTransport(LocalProcessTransport, request);

      assert.equal(result.status, "completed");
      assert.equal(result.executionStarted, true);
      assert.equal(result.stdout, "with spaces && not-a-shell-operator");
      assert.equal(result.stderr, "warn");
      assert.deepEqual(
        result.events.map((event) => event.sequence),
        [1, 2, 3, 4, 5],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects before process start when the transport policy denies execution", async () => {
    const root = projectRoot();
    try {
      const result = await LocalProcessTransport.execute(
        transportRequest(root, {
          policy: transportPolicy({ allowedTransportIds: [] }),
        }),
      );
      assert.equal(result.status, "rejected");
      assert.equal(result.error?.code, "transport_not_allowed");
      assert.equal(result.executionStarted, false);
      assert.deepEqual(result.events, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("normalizes guarded backend rejections without leaking command details", async () => {
    const root = projectRoot();
    try {
      const request = transportRequest(root);
      const result = await LocalProcessTransport.execute({
        ...request,
        localProcessPolicy: { ...request.localProcessPolicy, enabled: false },
      });
      assert.equal(result.status, "rejected");
      assert.equal(result.error?.code, "transport_disabled");
      assert.equal(result.error?.executionStarted, false);
      assert.doesNotMatch(JSON.stringify(result.error), /transport-ok/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Core transport orchestration", () => {
  it("rejects inert provider plans before transport resolution or execution", async () => {
    const root = projectRoot();
    try {
      const runtime = runtimeRequest(root);
      const plan = providerStubPlan();
      const created = createTransportAdapterRequest(runtime, plan, transportPolicy());
      assert.equal(created.outcome, "rejected");
      if (created.outcome === "rejected") {
        assert.equal(created.error.code, "provider_plan_not_executable");
        assert.equal(created.error.executionStarted, false);
      }

      const result = await executeProviderPlan(
        runtime,
        plan,
        transportPolicy(),
      );
      assert.equal(result.status, "rejected");
      assert.equal(result.error?.code, "provider_plan_not_executable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps resolution inert and maps transport output only after explicit execution", async () => {
    const root = projectRoot();
    try {
      const request = transportRequest(root);
      const resolution = resolveTransport(request);
      assert.equal(resolution.outcome, "resolved");
      if (resolution.outcome === "resolved") {
        assert.equal(resolution.adapter.id, "local-process");
      }

      const plan = providerStubPlan();
      const transportResult: TransportResult = {
        transportId: "local-process",
        providerId: plan.providerId,
        runtimeId: plan.runtimeId,
        status: "completed",
        executionStarted: true,
        exitCode: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.001Z",
        durationMs: 1,
        events: [],
        diagnostics: [],
        metadata: {},
      };
      const providerResult = normalizeProviderTransportResult(
        plan,
        transportResult,
      );
      assert.equal(providerResult.status, "completed");
      assert.deepEqual(providerResult.output, { stdout: "ok", stderr: "" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("transport architecture invariants", () => {
  const transportFiles = [
    "src/transports/types.ts",
    "src/transports/errors.ts",
    "src/transports/support.ts",
    "src/transports/registry.ts",
    "src/transports/selector.ts",
    "src/transports/local-process.ts",
  ];

  for (const file of transportFiles) {
    it(`${file} has no provider adapter, network, secret, or duplicate process API`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /providers\//);
      assert.doesNotMatch(source, /ProviderAdapter/);
      assert.doesNotMatch(source, /child_process/);
      assert.doesNotMatch(source, /\bspawn\s*\(/);
      assert.doesNotMatch(source, /\bexec(?:File|Sync)?\s*\(/);
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /node:(http|https|net|tls)/);
      assert.doesNotMatch(source, /process\.env/);
    });
  }

  it("keeps transport execution out of CLI and LoopRunner", () => {
    assert.doesNotMatch(readFileSync("src/cli.ts", "utf8"), /transports\//);
    assert.doesNotMatch(
      readFileSync("src/loop/runner.ts", "utf8"),
      /transports\//,
    );
  });
});

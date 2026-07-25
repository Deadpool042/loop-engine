import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createLocalProcessRuntime,
  type LocalProcessExecutor,
  type ValidatedLocalProcessRequest,
} from "../../src/runtime/local-process.js";
import type {
  LocalProcessExecutionPolicy,
  RuntimeRequest,
  RuntimeResult,
} from "../../src/runtime/index.js";

function projectRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "loop-runtime-boundary-")));
}

function policy(root: string): LocalProcessExecutionPolicy {
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

function request(
  root: string,
  options: Readonly<{ shellPermission?: boolean }> = {},
): RuntimeRequest {
  const shellPermission = options.shellPermission ?? true;
  const permissions = shellPermission
    ? ["read_only", "shell_exec"]
    : ["read_only"];
  const profile = {
    id: "local.fixture",
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
      path: "docs/roadmap/runtime.md",
      line: 1,
      text: "- [ ] local process",
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
      policyId: "local-policy",
      mode: "execute",
      status: "resolved",
      requirements: {
        category: "validation",
        mode: "execute",
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: permissions,
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
    metadata: { requestId: "local-process-boundary-fixture" },
    requestedRuntime: "local-process",
    localProcess: {
      command: {
        executable: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
        cwd: root,
      },
      executionPolicy: policy(root),
    },
  };
}

describe("LocalProcessRuntime execution boundary", () => {
  it("never invokes the executor for an invalid request", async () => {
    const root = projectRoot();
    try {
      let invocationCount = 0;
      const spy: LocalProcessExecutor = () => {
        invocationCount += 1;
        throw new Error("must not be called");
      };
      const runtime = createLocalProcessRuntime(spy);

      const result = await runtime.execute(
        request(root, { shellPermission: false }),
      );

      assert.equal(invocationCount, 0);
      assert.equal(result.status, "denied");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("invokes the executor exactly once for a valid request, with the minimal validated data", async () => {
    const root = projectRoot();
    try {
      let invocationCount = 0;
      let received: ValidatedLocalProcessRequest | null = null;
      const spy: LocalProcessExecutor = (validated) => {
        invocationCount += 1;
        received = validated;
        return {
          runtimeId: "local-process",
          status: "completed",
          startedAt: validated.startedAt,
          completedAt: validated.startedAt,
          diagnostics: [],
          output: { stdout: "spy-stdout", stderr: "" },
          metadata: validated.metadata,
          stdout: "spy-stdout",
          stderr: "",
          events: [],
          exitCode: 0,
          signal: null,
        } satisfies RuntimeResult;
      };
      const runtime = createLocalProcessRuntime(spy);
      const req = request(root);

      const result = await runtime.execute(req);

      assert.equal(invocationCount, 1);
      assert.ok(received);
      const validated = received as unknown as ValidatedLocalProcessRequest;
      assert.equal(validated.executable, realpathSync(process.execPath));
      assert.equal(validated.cwd, root);
      assert.deepEqual(validated.args, req.localProcess!.command.args);
      assert.equal(validated.stdin, req.localProcess!.command.stdin);
      assert.deepEqual(validated.metadata, req.metadata);
      assert.equal(typeof validated.startedAt, "string");
      assert.equal(validated.policy, req.localProcess!.executionPolicy);

      assert.equal(result.status, "completed");
      assert.equal(result.stdout, "spy-stdout");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("propagates the node executor's real RuntimeResult unchanged through the boundary", async () => {
    const root = projectRoot();
    try {
      const runtime = createLocalProcessRuntime();
      const result = await runtime.execute(request(root));

      assert.equal(result.status, "completed");
      assert.equal(result.stdout, "ok");
      assert.equal(result.exitCode, 0);
      assert.equal(result.signal, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createRuntimeRequest,
  executeRuntime,
  resolveRuntime,
  runLoopPlan,
} from "../../src/core/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function completedLoopResult(): LoopRunResult {
  const candidate = {
    path: "docs/roadmap/runtime.md",
    line: 1,
    text: "- [ ] Runtime abstraction",
    kind: "safe" as const,
    reason: "fixture",
    status: "todo" as const,
    priority: "default",
  };
  const contextBudget = {
    maxFiles: 1,
    maxCharacters: 100,
    maxEstimatedTokens: 25,
    includeFullFiles: false,
  };
  const profile = {
    id: "codex.fixture",
    runtime: "codex" as const,
    provider: "openai" as const,
    model: "fixture-model",
    effort: "medium" as const,
    capabilities: ["code_edit" as const],
    permissions: ["read_only" as const],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };

  return {
    schemaVersion: 1,
    runId: "runtime-fixture",
    project: "fixture",
    mode: "plan",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    candidate,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: {
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
        contextBudget,
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
    contextPackage: {
      project: "fixture",
      budget: contextBudget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
  };
}

describe("Core runtime integration", () => {
  it("resolves and invokes only a deterministic stub without changing the loop result", async () => {
    const result = completedLoopResult();
    const before = JSON.stringify(result);
    const request = createRuntimeRequest(result);

    assert.ok(request, "a completed plan exposes an internal runtime request");
    if (!request) return;

    const selection = resolveRuntime(request);
    assert.equal(selection.outcome, "selected");

    const runtimeResult = await executeRuntime(request);
    assert.equal(runtimeResult.status, "not_implemented");
    assert.equal(runtimeResult.output, null);
    assert.equal(runtimeResult.startedAt, request.requestedAt);
    assert.equal(runtimeResult.completedAt, request.requestedAt);
    assert.equal(JSON.stringify(result), before);
  });

  it("does not create a runtime request for blocked or failed loop results", () => {
    const result = runLoopPlan("unknown-project");
    assert.equal(createRuntimeRequest(result), null);
  });

  it("delegates an explicit guarded local-process request without changing LoopRunResult", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-core-runtime-")),
    );
    const result = completedLoopResult();
    const localResult: LoopRunResult = {
      ...result,
      mode: "execute",
      agentPolicy: {
        ...result.agentPolicy!,
        mode: "execute",
        requirements: {
          ...result.agentPolicy!.requirements,
          mode: "execute",
          requiredCapabilities: ["shell_exec"],
          requiredPermissions: ["shell_exec"],
        },
        selection: {
          outcome: "selected",
          profile: {
            ...result.agentPolicy!.selection!.profile,
            runtime: "custom",
            provider: "local",
            capabilities: ["shell_exec"],
            permissions: ["shell_exec"],
          },
          rejected: [],
        },
      },
    };
    const before = JSON.stringify(localResult);

    try {
      const request = createRuntimeRequest(localResult, {
        requestedRuntime: "local-process",
        localProcess: {
          command: {
            executable: process.execPath,
            args: ["-e", "process.stdout.write('core')"],
            cwd: root,
          },
          executionPolicy: {
            enabled: true,
            projectRoot: root,
            allowedExecutables: [process.execPath],
            allowedEnvironmentKeys: [],
            timeoutMs: 2_000,
            maxStdoutBytes: 128,
            maxStderrBytes: 128,
          },
        },
      });

      assert.ok(request);
      if (!request) return;
      assert.equal(resolveRuntime(request).outcome, "selected");

      const runtimeResult = await executeRuntime(request);
      assert.equal(runtimeResult.status, "completed");
      assert.equal(runtimeResult.stdout, "core");
      assert.equal(JSON.stringify(localResult), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  createOpenClawAcpClaudeLoopExecutor,
  type OpenClawAcpClaudeControl,
  type OpenClawAcpClaudeSession,
} from "../../src/loop/openclaw-acp-claude-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

function setupRepo(): { root: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "loop-claude-acp-"));
  const cwd = join(root, "worktree");
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  writeFileSync(join(cwd, "baseline.md"), "baseline\n");
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd });
  return {
    root,
    cwd,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function fakePlan(): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-acp-claude-1",
    project: { name: "test" },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] test ACP Claude candidate",
      kind: "safe",
      reason: "bounded test",
      status: "todo",
      priority: "default",
    },
    contextPackage: {
      project: "test",
      budget: {
        maxFiles: 10,
        maxCharacters: 1000,
        maxEstimatedTokens: 1000,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    provider: "anthropic",
    runtime: "openclaw",
    profileId: "configured.openclaw.acp.claude",
    model: "claude-sonnet-test",
    effort: "medium",
    delegation: {
      mode: "runtime_managed_allowed",
      reason: "higher_effort",
    },
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: 5_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
    policy: {
      id: "policy-acp-claude-1",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  });
}

type ControlLog = {
  opens: unknown[];
  turns: unknown[];
  cancels: unknown[];
  closes: unknown[];
};

function fakeControl(
  input: Readonly<{
    cwd: string;
    openKind?: "auth" | "quota" | "runtime";
    turnStatus?: "completed" | "failed" | "timeout" | "cancelled";
    turnKind?: "auth" | "quota" | "permission" | "runtime" | "timeout" | "cancelled" | "unknown";
    turnProvider?: string;
    turnModel?: string;
    closeOk?: boolean;
    writeFile?: Readonly<{ path: string; content: string }>;
  }>,
): { control: OpenClawAcpClaudeControl; log: ControlLog } {
  const log: ControlLog = { opens: [], turns: [], cancels: [], closes: [] };
  const session: OpenClawAcpClaudeSession = Object.freeze({
    sessionKey: "agent:main:acp:test-session",
    runtimeSessionId: "runtime-1",
    backendSessionId: "backend-1",
  });
  const control: OpenClawAcpClaudeControl = {
    async openSession(value) {
      log.opens.push(value);
      if (input.openKind) return { status: "failed", kind: input.openKind };
      return { status: "ready", session };
    },
    async runTurn(value) {
      log.turns.push(value);
      if (input.writeFile) {
        writeFileSync(
          join(input.cwd, input.writeFile.path),
          input.writeFile.content,
        );
      }
      const status = input.turnStatus ?? "completed";
      if (status === "completed") {
        return {
          status: "completed",
          runtime: "acp",
          provider: input.turnProvider ?? "anthropic",
          model: input.turnModel ?? "claude-sonnet-test",
        } as const;
      }
      return {
        status,
        kind: input.turnKind ?? (status === "timeout" ? "timeout" : status === "cancelled" ? "cancelled" : "unknown"),
      } as const;
    },
    async cancel(value) {
      log.cancels.push(value);
      return true;
    },
    async close(value) {
      log.closes.push(value);
      return input.closeOk ?? true;
    },
  };
  return { control, log };
}

describe("createOpenClawAcpClaudeLoopExecutor", () => {
  it("passes the admitted cwd, model, thinking, permission profile and timeout to ACP control", async () => {
    const repo = setupRepo();
    try {
      const { control, log } = fakeControl({
        cwd: repo.cwd,
        writeFile: { path: "result.md", content: "ok\n" },
      });
      const result = await createOpenClawAcpClaudeLoopExecutor({
        control,
        permissionProfile: "strict",
        timeoutMs: 12_345,
      })(fakePlan(), repo.cwd);

      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["result.md"]);
      assert.deepEqual(log.opens, [
        {
          runId: "run-acp-claude-1",
          cwd: resolve(repo.cwd),
          agentId: "claude",
          model: "claude-sonnet-test",
          thinking: "medium",
          permissionProfile: "strict",
          timeoutSeconds: 13,
        },
      ]);
      assert.equal(log.turns.length, 1);
      const turn = log.turns[0] as { prompt: string };
      assert.match(turn.prompt, /test ACP Claude candidate/);
      assert.match(turn.prompt, /runtime=openclaw/);
      assert.match(turn.prompt, /Do not commit, push, tag, publish/);
      assert.equal(log.cancels.length, 0);
      assert.equal(log.closes.length, 1);
    } finally {
      repo.cleanup();
    }
  });

  it("fails closed before ACP when the worktree is dirty", async () => {
    const repo = setupRepo();
    try {
      writeFileSync(join(repo.cwd, "dirty.md"), "dirty\n");
      const { control, log } = fakeControl({ cwd: repo.cwd });
      const result = await createOpenClawAcpClaudeLoopExecutor({ control })(
        fakePlan(),
        repo.cwd,
      );
      assert.equal(result.status, "failed");
      assert.equal(result.status === "failed" ? result.failure.code : null, "worktree_not_clean");
      assert.equal(log.opens.length, 0);
    } finally {
      repo.cleanup();
    }
  });

  it("preserves bounded repair admission inside allowedPaths", async () => {
    const repo = setupRepo();
    try {
      writeFileSync(join(repo.cwd, "feature.ts"), "export const value = 1;\n");
      const { control } = fakeControl({ cwd: repo.cwd });
      const result = await createOpenClawAcpClaudeLoopExecutor({ control })(
        {
          ...fakePlan(),
          allowedPaths: ["feature.ts"],
          worktreeMode: "repair_existing",
        },
        repo.cwd,
      );
      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["feature.ts"]);
    } finally {
      repo.cleanup();
    }
  });

  it("maps structured open failures without invoking a turn", async () => {
    for (const [kind, code] of [
      ["auth", "provider_unavailable"],
      ["quota", "provider_limit_exceeded"],
      ["runtime", "runtime_unavailable"],
    ] as const) {
      const repo = setupRepo();
      try {
        const { control, log } = fakeControl({ cwd: repo.cwd, openKind: kind });
        const result = await createOpenClawAcpClaudeLoopExecutor({ control })(fakePlan(), repo.cwd);
        assert.equal(result.status, "failed");
        assert.equal(result.status === "failed" ? result.failure.code : null, code);
        assert.equal(log.turns.length, 0);
        assert.equal(log.closes.length, 0);
      } finally {
        repo.cleanup();
      }
    }
  });

  it("cancels timed-out turns and always closes the ACP session", async () => {
    const repo = setupRepo();
    try {
      const { control, log } = fakeControl({ cwd: repo.cwd, turnStatus: "timeout" });
      const result = await createOpenClawAcpClaudeLoopExecutor({ control })(fakePlan(), repo.cwd);
      assert.equal(result.status, "failed");
      assert.equal(result.status === "failed" ? result.failure.code : null, "provider_timeout");
      assert.equal(log.cancels.length, 1);
      assert.equal(log.closes.length, 1);
    } finally {
      repo.cleanup();
    }
  });

  it("rejects provider/model mismatch even after an ACP turn reports completion", async () => {
    for (const input of [
      { turnProvider: "openai" },
      { turnModel: "claude-other" },
    ]) {
      const repo = setupRepo();
      try {
        const { control } = fakeControl({ cwd: repo.cwd, ...input });
        const result = await createOpenClawAcpClaudeLoopExecutor({ control })(fakePlan(), repo.cwd);
        assert.equal(result.status, "failed");
        assert.equal(
          result.status === "failed" ? result.failure.code : null,
          "execution_plan_model_mismatch",
        );
      } finally {
        repo.cleanup();
      }
    }
  });

  it("fails the run when ACP session cleanup does not settle", async () => {
    const repo = setupRepo();
    try {
      const { control } = fakeControl({ cwd: repo.cwd, closeOk: false });
      const result = await createOpenClawAcpClaudeLoopExecutor({ control })(fakePlan(), repo.cwd);
      assert.equal(result.status, "failed");
      assert.equal(result.status === "failed" ? result.failure.code : null, "runtime_cleanup_failed");
    } finally {
      repo.cleanup();
    }
  });

  it("keeps the existing content-policy gate after ACP execution", async () => {
    for (const [content, expected] of [
      ["Documentation standard\n", "completed"],
      ["Docker configuration\n", "failed"],
    ] as const) {
      const repo = setupRepo();
      try {
        const { control } = fakeControl({
          cwd: repo.cwd,
          writeFile: { path: "provider-created.md", content },
        });
        const result = await createOpenClawAcpClaudeLoopExecutor({ control })(
          {
            ...fakePlan(),
            brief: {
              objective: "Write a documentation standard.",
              deliverables: ["provider-created.md"],
              outOfScope: ["Infrastructure configuration"],
              forbiddenContentTerms: ["docker"],
            },
          },
          repo.cwd,
        );
        assert.equal(result.status, expected);
        if (result.status === "failed") {
          assert.equal(result.failure.code, "content_policy_violation");
        }
      } finally {
        repo.cleanup();
      }
    }
  });

  it("refuses non-ACP/non-Anthropic execution plans", async () => {
    const repo = setupRepo();
    try {
      const { control, log } = fakeControl({ cwd: repo.cwd });
      const result = await createOpenClawAcpClaudeLoopExecutor({ control })(
        { ...fakePlan(), runtime: "claude_code" },
        repo.cwd,
      );
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "execution_plan_provider_mismatch",
      );
      assert.equal(log.opens.length, 0);
    } finally {
      repo.cleanup();
    }
  });
});

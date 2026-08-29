import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createLoopApplicationAssembly } from "../../src/composition/index.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

function setupCleanWorktree(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "loop-burn-in-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function burnInPlan(_cwd: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-burn-in-1",
    project: { name: "burn-in-fixture" },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] Burn-in fixture candidate",
      kind: "safe",
      reason: "no sensitive keyword detected",
      status: "todo",
      priority: "default",
    },
    contextPackage: {
      project: "burn-in-fixture",
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
    runtime: "claude_code",
    profileId: "configured.claude_code",
    model: "claude-haiku-4-5",
    effort: "low",
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: null,
      maxRepairs: null,
    },
    policy: {
      id: "policy-burn-in-1",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  });
}

describe("claude code provider burn-in", () => {
  it("observes exactly the file created by the fake provider through LoopApplicationAssembly -> LoopExecutor -> worktree observation", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const application = createLoopApplicationAssembly({
        provider: {
          id: "claude_code",
          executable: FAKE_CLAUDE,
          timeoutMs: 5_000,
        },
      });
      assert.equal(typeof application.loopExecutor, "function");

      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await application.loopExecutor!(burnInPlan(cwd), cwd);

      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["provider-created.txt"]);
      assert.equal(
        readFileSync(join(cwd, "provider-created.txt"), "utf8"),
        "created\n",
      );

      const status = execFileSync("git", ["status", "--porcelain=v1"], {
        cwd,
        encoding: "utf8",
      });
      assert.equal(status.trim(), "?? provider-created.txt");
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });
});

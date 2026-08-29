// Burn-in 2 — repeated executions and delta isolation. Extends burn-in 1
// (single successful run) by proving three real invariants of the
// LoopApplicationAssembly -> LoopExecutor -> worktree observation path
// across *multiple* successive executions in one temporary Git repo:
//
//   1. once the worktree is re-baselined (committed) between two runs,
//      each run's modifiedFiles reflects only its own delta — a prior
//      run's file never reappears;
//   2. a preexisting, unattributed dirty worktree is refused outright
//      (worktree_not_clean) — the executor never blends preexisting drift
//      into a run's reported delta, per the real contract in
//      src/loop/claude-code-cli-executor.ts (checked, not assumed);
//   3. a failing run occurring after a prior successful, re-baselined run
//      never inherits that prior run's file and never invents a delta
//      beyond what the (simulated) provider actually left behind.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  const cwd = mkdtempSync(join(tmpdir(), "loop-repeated-burn-in-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function commitAllInTempRepoOnly(cwd: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd });
}

function gitStatus(cwd: string): string {
  return execFileSync("git", ["status", "--porcelain=v1"], {
    cwd,
    encoding: "utf8",
  }).trim();
}

const DECOY_PROJECT_PATH = "/nonexistent/decoy-project-path";

function burnInPlan(_cwd: string, runId: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId,
    project: {
      name: "burn-in-fixture",
      path: DECOY_PROJECT_PATH,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: [],
    },
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
      id: `policy-${runId}`,
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  });
}

function clearFakeClaudeEnv(): void {
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_OUTPUT_FILE;
}

describe("claude code provider repeated burn-in", () => {
  it("isolates the delta between two successive runs once the worktree is re-baselined via commit", async () => {
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
      process.env.FAKE_CLAUDE_OUTPUT_FILE = "run-one.txt";
      const first = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-1a"),
        cwd,
      );

      assert.equal(first.status, "completed");
      assert.deepEqual(first.modifiedFiles, ["run-one.txt"]);
      assert.equal(readFileSync(join(cwd, "run-one.txt"), "utf8"), "created\n");

      // Explicit new baseline between runs — committed only in this
      // temporary test repository, never in the Loop Engine repo itself.
      commitAllInTempRepoOnly(cwd, "baseline: run one");
      assert.equal(gitStatus(cwd), "");

      process.env.FAKE_CLAUDE_OUTPUT_FILE = "run-two.txt";
      const second = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-1b"),
        cwd,
      );

      assert.equal(second.status, "completed");
      assert.deepEqual(second.modifiedFiles, ["run-two.txt"]);
      assert.equal(second.modifiedFiles.includes("run-one.txt"), false);
      assert.equal(readFileSync(join(cwd, "run-two.txt"), "utf8"), "created\n");
      assert.equal(gitStatus(cwd), "?? run-two.txt");
    } finally {
      clearFakeClaudeEnv();
      cleanup();
    }
  });

  it("refuses the run when a preexisting untracked file leaves the worktree unclean, instead of blending it into the delta", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      writeFileSync(join(cwd, "preexisting.txt"), "dirty\n");

      const application = createLoopApplicationAssembly({
        provider: {
          id: "claude_code",
          executable: FAKE_CLAUDE,
          timeoutMs: 5_000,
        },
      });

      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_OUTPUT_FILE = "provider-delta.txt";
      const result = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-2"),
        cwd,
      );

      // Verified against src/loop/claude-code-cli-executor.ts: the
      // executor snapshots `git status` before ever invoking the provider
      // and fails closed with "worktree_not_clean" when it is not empty —
      // it never runs the provider against an unattributed dirty state.
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "worktree_not_clean",
      );
      assert.deepEqual(
        result.status === "failed" ? result.modifiedFiles : null,
        [],
      );
      assert.equal(existsSync(join(cwd, "provider-delta.txt")), false);
      assert.equal(gitStatus(cwd), "?? preexisting.txt");
    } finally {
      clearFakeClaudeEnv();
      cleanup();
    }
  });

  it("a failing run after a prior successful, re-baselined run reports no invented delta and no leftover contamination from that prior run", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const application = createLoopApplicationAssembly({
        provider: {
          id: "claude_code",
          executable: FAKE_CLAUDE,
          timeoutMs: 5_000,
        },
      });

      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_OUTPUT_FILE = "run-one.txt";
      const first = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-3a"),
        cwd,
      );
      assert.equal(first.status, "completed");

      commitAllInTempRepoOnly(cwd, "baseline: run one");
      assert.equal(gitStatus(cwd), "");

      process.env.FAKE_CLAUDE_MODE = "nonzero_exit_with_file";
      delete process.env.FAKE_CLAUDE_OUTPUT_FILE;
      const second = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-3b"),
        cwd,
      );

      assert.equal(second.status, "failed");
      assert.equal(
        second.status === "failed" ? second.failure.code : null,
        "provider_failed",
      );
      assert.deepEqual(
        second.status === "failed" ? second.modifiedFiles : null,
        ["provider-leftover.txt"],
      );
      assert.equal(second.modifiedFiles.includes("run-one.txt"), false);
      assert.equal(
        readFileSync(join(cwd, "provider-leftover.txt"), "utf8"),
        "leftover\n",
      );
      assert.equal(gitStatus(cwd), "?? provider-leftover.txt");
    } finally {
      clearFakeClaudeEnv();
      cleanup();
    }
  });

  it("FAKE_CLAUDE_OUTPUT_FILE rejects an absolute path or a '..' traversal, and the default output file stays unchanged when unset", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const application = createLoopApplicationAssembly({
        provider: {
          id: "claude_code",
          executable: FAKE_CLAUDE,
          timeoutMs: 5_000,
        },
      });

      process.env.FAKE_CLAUDE_MODE = "success_with_file";

      process.env.FAKE_CLAUDE_OUTPUT_FILE = "/tmp/absolute.txt";
      const absoluteResult = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-4a"),
        cwd,
      );
      assert.equal(absoluteResult.status, "failed");
      assert.deepEqual(absoluteResult.modifiedFiles, []);
      assert.equal(gitStatus(cwd), "");

      process.env.FAKE_CLAUDE_OUTPUT_FILE = "../escape.txt";
      const traversalResult = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-4b"),
        cwd,
      );
      assert.equal(traversalResult.status, "failed");
      assert.deepEqual(traversalResult.modifiedFiles, []);
      assert.equal(gitStatus(cwd), "");

      delete process.env.FAKE_CLAUDE_OUTPUT_FILE;
      const defaultResult = await application.loopExecutor!(
        burnInPlan(cwd, "run-repeated-burn-in-4c"),
        cwd,
      );
      assert.equal(defaultResult.status, "completed");
      assert.deepEqual(defaultResult.modifiedFiles, ["provider-created.txt"]);
    } finally {
      clearFakeClaudeEnv();
      cleanup();
    }
  });
});

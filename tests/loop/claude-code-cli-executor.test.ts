import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createClaudeCodeCliLoopExecutor } from "../../src/loop/claude-code-cli-executor.js";
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
  const cwd = mkdtempSync(join(tmpdir(), "loop-claude-executor-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function fakePlan(cwd: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-1",
    project: {
      name: "test",
      path: cwd,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: [],
    },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] test candidate",
      kind: "safe",
      reason: "no sensitive keyword detected",
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
    runtime: "claude_code",
    profileId: "profile-1",
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
      id: "policy-1",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  });
}

describe("createClaudeCodeCliLoopExecutor", () => {
  it("accepts only an executable named claude", () => {
    assert.throws(
      () => createClaudeCodeCliLoopExecutor({ executable: "/usr/bin/node" }),
      /command named claude/,
    );
    assert.equal(
      typeof createClaudeCodeCliLoopExecutor({
        executable: "/usr/local/bin/claude",
      }),
      "function",
    );
  });

  it("rejects non-positive process and turn limits", () => {
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({ executable: "claude", timeoutMs: 0 }),
      /timeout must be a positive integer/,
    );
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({
          executable: "claude",
          maxOutputBytes: 0,
        }),
      /output limit must be a positive integer/,
    );
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({ executable: "claude", maxTurns: 0 }),
      /maxTurns must be a positive integer/,
    );
  });

  it("classifies a successful Claude Code JSON response", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "completed");
    } finally {
      cleanup();
    }
  });

  it("fails with provider_reported_error when Claude reports is_error", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "is_error";
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_reported_error",
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("classifies max-turn exhaustion before generic non-zero exit failure", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "max_turns";
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_max_turns",
      );
      assert.equal(
        JSON.stringify(result).includes("Reached maximum number of turns"),
        false,
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("fails with provider_invalid_output on unparsable JSON", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "invalid_json";
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_invalid_output",
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("fails with provider_failed on a non-zero exit code", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "nonzero_exit_with_file";
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_failed",
      );
      assert.deepEqual(result.status === "failed" ? result.modifiedFiles : [], [
        "provider-leftover.txt",
      ]);
      assert.equal(
        readFileSync(join(cwd, "provider-leftover.txt"), "utf8"),
        "leftover\n",
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("fails with provider_timeout when the process exceeds the configured timeout", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 200,
      });
      process.env.FAKE_CLAUDE_MODE = "hang";
      const result = await executor(fakePlan(cwd));
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_timeout",
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("never leaks raw stdout, stderr or prompt content in the failure details", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "nonzero_exit";
      const result = await executor(fakePlan(cwd));
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("Implement exactly one"), false);
      assert.equal(serialized.includes("error_during_execution"), false);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("passes roadmap protection constraints to Claude Code", async () => {
    const { cwd, cleanup } = setupCleanWorktree();
    const capturePath = join(cwd, "claude-arguments.json");

    try {
      process.env.FAKE_CLAUDE_MODE = "success";
      process.env.FAKE_CLAUDE_CAPTURE_ARGS = capturePath;

      const executor = createClaudeCodeCliLoopExecutor({
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      });

      const result = await executor(fakePlan(cwd));

      assert.equal(result.status, "completed");

      const capturedArgs = JSON.parse(
        readFileSync(capturePath, "utf8"),
      ) as string[];

      const prompt = capturedArgs.at(-1) ?? "";

      assert.match(
        prompt,
        /Do not modify the roadmap or mark the selected candidate complete\./,
      );
      assert.match(
        prompt,
        /Implement only the target files explicitly named by the selected candidate\./,
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_ARGS;
      cleanup();
    }
  });
});

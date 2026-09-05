import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
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

function setupCleanWorktree(): {
  cwd: string;
  executable: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-claude-executor-"));
  const cwd = join(root, "worktree");
  const executable = join(root, "claude");
  copyFileSync(FAKE_CLAUDE, executable);
  chmodSync(executable, 0o755);
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  return {
    cwd,
    executable,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function fakePlan(_cwd: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-1",
    project: { name: "test" },
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
    delegation: {
      mode: "direct_preferred",
      reason: "low_effort",
    },
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      const result = await executor(fakePlan(cwd), cwd);
      assert.equal(result.status, "completed");
    } finally {
      cleanup();
    }
  });

  it("fails with provider_reported_error when Claude reports is_error", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "is_error";
      const result = await executor(fakePlan(cwd), cwd);
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "max_turns";
      const result = await executor(fakePlan(cwd), cwd);
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "invalid_json";
      const result = await executor(fakePlan(cwd), cwd);
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "nonzero_exit_with_file";
      const result = await executor(fakePlan(cwd), cwd);
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 200,
      });
      process.env.FAKE_CLAUDE_MODE = "hang";
      const result = await executor(fakePlan(cwd), cwd);
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
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });
      process.env.FAKE_CLAUDE_MODE = "nonzero_exit";
      const result = await executor(fakePlan(cwd), cwd);
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("Implement exactly one"), false);
      assert.equal(serialized.includes("error_during_execution"), false);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("passes the governed brief and every declared deliverable to Claude Code", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const capturePath = join(cwd, "claude-arguments.json");

    try {
      process.env.FAKE_CLAUDE_MODE = "success";
      process.env.FAKE_CLAUDE_CAPTURE_ARGS = capturePath;
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });

      const result = await executor(
        Object.freeze({
          ...fakePlan(cwd),
          allowedPaths: [
            "ADR/0006-strategie-observabilite.md",
            "docs/roadmap/projet-lp-infra.md",
          ],
          brief: {
            objective: "Define the observability strategy.",
            deliverables: [
              "ADR/0006-strategie-observabilite.md",
              "Update H3-L1 roadmap status.",
            ],
            outOfScope: ["Tool installation"],
          },
        }),
        cwd,
      );

      assert.equal(result.status, "completed");
      const prompt =
        (JSON.parse(readFileSync(capturePath, "utf8")) as string[]).at(-1) ??
        "";
      assert.match(prompt, /Governed mission brief:/);
      assert.match(prompt, /Required deliverables:/);
      assert.match(prompt, /Update H3-L1 roadmap status\./);
      assert.doesNotMatch(prompt, /Do not modify the roadmap/);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_ARGS;
      cleanup();
    }
  });

  it("restricts Claude Code tools/MCP and strips unrelated credentials", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const captureArgs = join(cwd, "claude-args-security.json");
    const captureEnv = join(cwd, "claude-env-security.json");

    try {
      process.env.FAKE_CLAUDE_CAPTURE_ARGS = captureArgs;
      process.env.FAKE_CLAUDE_CAPTURE_ENV = captureEnv;
      process.env.OPENAI_API_KEY = "should-not-reach-claude";
      process.env.ANTHROPIC_API_KEY = "should-not-reach-claude";
      process.env.GITHUB_TOKEN = "should-not-reach-claude";
      process.env.SSH_AUTH_SOCK = "/tmp/should-not-reach-claude";

      const result = await createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(cwd), cwd);

      assert.equal(result.status, "completed");
      const args = JSON.parse(readFileSync(captureArgs, "utf8")) as string[];
      assert.ok(args.includes("--tools"));
      assert.equal(args[args.indexOf("--tools") + 1], "Read,Edit,Write,Glob,Grep");
      assert.ok(args.includes("--strict-mcp-config"));
      assert.equal(args[args.indexOf("--mcp-config") + 1], "{}");
      assert.equal(args.includes("Bash"), false);

      const childEnv = JSON.parse(readFileSync(captureEnv, "utf8")) as Record<
        string,
        string
      >;
      assert.equal(childEnv.OPENAI_API_KEY, undefined);
      assert.equal(childEnv.ANTHROPIC_API_KEY, undefined);
      assert.equal(childEnv.GITHUB_TOKEN, undefined);
      assert.equal(childEnv.SSH_AUTH_SOCK, undefined);
      assert.equal(childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
      assert.equal(childEnv.HOME, process.env.HOME);
      assert.equal(childEnv.PATH, process.env.PATH);
    } finally {
      delete process.env.FAKE_CLAUDE_CAPTURE_ARGS;
      delete process.env.FAKE_CLAUDE_CAPTURE_ENV;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.SSH_AUTH_SOCK;
      cleanup();
    }
  });

  it("passes roadmap protection constraints to Claude Code", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const capturePath = join(cwd, "claude-arguments.json");

    try {
      process.env.FAKE_CLAUDE_MODE = "success";
      process.env.FAKE_CLAUDE_CAPTURE_ARGS = capturePath;

      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });

      const result = await executor(fakePlan(cwd), cwd);

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
      assert.match(prompt, /Prefer direct execution for this low-effort task\./);
      assert.match(
        prompt,
        /Do not add or switch to another external provider, paid API, credential, or runtime\./,
      );
      assert.doesNotMatch(
        prompt,
        /You may use runtime-native skills or sub-agents/,
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_ARGS;
      cleanup();
    }
  });

  it("allows bounded runtime-managed delegation above low effort", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const capturePath = join(cwd, "claude-delegation-arguments.json");

    try {
      process.env.FAKE_CLAUDE_MODE = "success";
      process.env.FAKE_CLAUDE_CAPTURE_ARGS = capturePath;
      const executor = createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });

      const result = await executor(
        Object.freeze({
          ...fakePlan(cwd),
          effort: "high",
          delegation: {
            mode: "runtime_managed_allowed",
            reason: "higher_effort",
          },
          allowedPaths: ["src/**"],
          brief: {
            objective: "Implement the bounded change.",
            deliverables: ["Update the implementation."],
            outOfScope: ["Unrelated refactors"],
          },
        }),
        cwd,
      );

      assert.equal(result.status, "completed");
      const prompt =
        (JSON.parse(readFileSync(capturePath, "utf8")) as string[]).at(-1) ??
        "";
      assert.match(
        prompt,
        /You may use runtime-native skills or sub-agents when independent work streams or an independent review would materially improve speed or safety\./,
      );
      assert.match(prompt, /Keep delegation minimal and shallow/);
      assert.match(
        prompt,
        /Any runtime-native skill or sub-agent remains bound by the same objective, deliverables, out-of-scope rules, writable file scope, policy permissions, and no-publication boundary\./,
      );
      assert.match(prompt, /You remain responsible for one final worktree delta\./);
      assert.match(
        prompt,
        /Delegated work is not authoritative validation; Loop Engine validates the final delta after you return\./,
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_ARGS;
      cleanup();
    }
  });

  it("fails closed when Claude Code generates a forbidden governed content term", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_forbidden_content";
      const result = await createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(
        {
          ...fakePlan(cwd),
          brief: {
            objective: "Write a documentation standard.",
            deliverables: ["provider-created.md"],
            outOfScope: ["Infrastructure configuration"],
            forbiddenContentTerms: ["docker"],
          },
        },
        cwd,
      );
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "content_policy_violation",
      );
      assert.equal(JSON.stringify(result).includes("docker"), false);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });

  it("keeps a Claude Code execution successful when generated content is compliant", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await createClaudeCodeCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(
        {
          ...fakePlan(cwd),
          brief: {
            objective: "Write a documentation standard.",
            deliverables: ["provider-created.txt"],
            outOfScope: ["Infrastructure configuration"],
            forbiddenContentTerms: ["docker"],
          },
        },
        cwd,
      );
      assert.equal(result.status, "completed");
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });
});

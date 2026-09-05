import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { createCodexCliLoopExecutor } from "../../src/loop/codex-cli-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

function setupCleanWorktree(): {
  cwd: string;
  executable: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-codex-executor-"));
  const cwd = join(root, "worktree");
  const executable = join(root, "codex");
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const captureArgs = process.env.FAKE_CODEX_CAPTURE_ARGS;
const captureCwd = process.env.FAKE_CODEX_CAPTURE_CWD;
const captureEnv = process.env.FAKE_CODEX_CAPTURE_ENV;
if (captureArgs) writeFileSync(captureArgs, JSON.stringify(process.argv.slice(2)));
if (captureCwd) writeFileSync(captureCwd, process.cwd());
if (captureEnv) writeFileSync(captureEnv, JSON.stringify(process.env));
const mode = process.env.FAKE_CODEX_MODE ?? "success";
if (mode === "hang") setInterval(() => {}, 1000);
if (mode === "nonzero") process.exit(9);
if (mode === "nonzero_after_write") {
  writeFileSync("outside.md", "partial provider change\\n");
  process.exit(9);
}
if (mode === "success_with_forbidden_content") {
  writeFileSync("provider-created.md", "Docker configuration\\n");
}
if (mode === "success_with_allowed_content") {
  writeFileSync("provider-created.md", "Documentation standard\\n");
}
process.stdout.write(JSON.stringify({ type: "task.completed" }) + "\\n");
`,
  );
  chmodSync(executable, 0o755);
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
    provider: "openai",
    runtime: "codex",
    profileId: "profile-1",
    model: "gpt-5.6-terra",
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

describe("createCodexCliLoopExecutor", () => {
  it("accepts only an executable named codex", () => {
    assert.throws(
      () => createCodexCliLoopExecutor({ executable: "/usr/bin/node" }),
      /command named codex/,
    );
    assert.equal(
      typeof createCodexCliLoopExecutor({ executable: "/usr/local/bin/codex" }),
      "function",
    );
  });

  it("rejects non-positive process limits", () => {
    assert.throws(
      () => createCodexCliLoopExecutor({ executable: "codex", timeoutMs: 0 }),
      /timeout must be a positive integer/,
    );
    assert.throws(
      () =>
        createCodexCliLoopExecutor({
          executable: "codex",
          maxOutputBytes: 0,
        }),
      /output limit must be a positive integer/,
    );
  });

  it("uses the current non-interactive workspace-write Codex CLI arguments", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const captureArgs = join(cwd, "../codex-arguments.json");
    const captureCwd = join(cwd, "../codex-cwd.txt");
    try {
      process.env.FAKE_CODEX_CAPTURE_ARGS = captureArgs;
      process.env.FAKE_CODEX_CAPTURE_CWD = captureCwd;
      const executor = createCodexCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });

      const result = await executor(fakePlan(cwd), cwd);

      assert.equal(result.status, "completed");
      const args = JSON.parse(readFileSync(captureArgs, "utf8")) as string[];
      assert.deepEqual(args.slice(0, -1), [
        "exec",
        "--ignore-user-config",
        "--sandbox",
        "workspace-write",
        "-c",
        'approval_policy="never"',
        "--model",
        "gpt-5.6-terra",
        "--json",
      ]);
      assert.equal(args.includes("--full-auto"), false);
      const prompt = args.at(-1) ?? "";
      assert.match(prompt, /Stay inside the current worktree\./);
      assert.match(prompt, /Prefer direct execution for this low-effort task\./);
      assert.match(
        prompt,
        /Do not add or switch to another external provider, paid API, credential, or runtime\./,
      );
      assert.doesNotMatch(
        prompt,
        /You may use runtime-native skills or sub-agents/,
      );
      assert.equal(
        readFileSync(captureCwd, "utf8"),
        realpathSync(resolve(cwd)),
      );
    } finally {
      delete process.env.FAKE_CODEX_CAPTURE_ARGS;
      delete process.env.FAKE_CODEX_CAPTURE_CWD;
      cleanup();
    }
  });

  it("does not inherit API keys or unrelated credentials into Codex", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const captureEnv = join(cwd, "../codex-env.json");
    try {
      process.env.FAKE_CODEX_CAPTURE_ENV = captureEnv;
      process.env.OPENAI_API_KEY = "should-not-reach-codex";
      process.env.ANTHROPIC_API_KEY = "should-not-reach-codex";
      process.env.GITHUB_TOKEN = "should-not-reach-codex";
      process.env.SSH_AUTH_SOCK = "/tmp/should-not-reach-codex";

      const result = await createCodexCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(cwd), cwd);

      assert.equal(result.status, "completed");
      const childEnv = JSON.parse(readFileSync(captureEnv, "utf8")) as Record<
        string,
        string
      >;
      assert.equal(childEnv.OPENAI_API_KEY, undefined);
      assert.equal(childEnv.ANTHROPIC_API_KEY, undefined);
      assert.equal(childEnv.GITHUB_TOKEN, undefined);
      assert.equal(childEnv.SSH_AUTH_SOCK, undefined);
      assert.equal(childEnv.HOME, process.env.HOME);
      assert.equal(childEnv.PATH, process.env.PATH);
    } finally {
      delete process.env.FAKE_CODEX_CAPTURE_ENV;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.SSH_AUTH_SOCK;
      cleanup();
    }
  });

  it("allows bounded runtime-managed delegation above low effort", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const captureArgs = join(cwd, "../codex-delegation-arguments.json");
    try {
      process.env.FAKE_CODEX_CAPTURE_ARGS = captureArgs;
      const executor = createCodexCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      });

      const result = await executor(
        {
          ...fakePlan(cwd),
          effort: "medium",
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
        },
        cwd,
      );

      assert.equal(result.status, "completed");
      const args = JSON.parse(readFileSync(captureArgs, "utf8")) as string[];
      const prompt = args.at(-1) ?? "";
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
      delete process.env.FAKE_CODEX_CAPTURE_ARGS;
      cleanup();
    }
  });

  it("preserves redacted generic failure for a non-zero Codex exit", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CODEX_MODE = "nonzero";
      const result = await createCodexCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(cwd), cwd);
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_failed",
      );
      assert.equal(
        JSON.stringify(result).includes("Codex CLI execution failed."),
        true,
      );
    } finally {
      delete process.env.FAKE_CODEX_MODE;
      cleanup();
    }
  });

  it("reports provider modifications even when Codex exits non-zero", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CODEX_MODE = "nonzero_after_write";
      const result = await createCodexCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(cwd), cwd);

      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_failed",
      );
      assert.deepEqual(result.modifiedFiles, ["outside.md"]);
    } finally {
      delete process.env.FAKE_CODEX_MODE;
      cleanup();
    }
  });

  it("fails closed when the configured model differs from the execution plan", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const result = await createCodexCliLoopExecutor({
        executable,
        model: "gpt-5.6-sol",
        timeoutMs: 5_000,
      })(fakePlan(cwd), cwd);

      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "execution_plan_model_mismatch",
      );
    } finally {
      cleanup();
    }
  });

  it("preserves the configured timeout limit", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CODEX_MODE = "hang";
      const result = await createCodexCliLoopExecutor({
        executable,
        timeoutMs: 100,
      })(fakePlan(cwd), cwd);
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_limit_exceeded",
      );
    } finally {
      delete process.env.FAKE_CODEX_MODE;
      cleanup();
    }
  });

  it("fails closed when Codex generates a forbidden governed content term", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CODEX_MODE = "success_with_forbidden_content";
      const result = await createCodexCliLoopExecutor({
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
      delete process.env.FAKE_CODEX_MODE;
      cleanup();
    }
  });

  it("keeps a Codex execution successful when generated content is compliant", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_CODEX_MODE = "success_with_allowed_content";
      const result = await createCodexCliLoopExecutor({
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
      assert.equal(result.status, "completed");
    } finally {
      delete process.env.FAKE_CODEX_MODE;
      cleanup();
    }
  });
});

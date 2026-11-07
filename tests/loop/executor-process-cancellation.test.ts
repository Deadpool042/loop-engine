import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
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

import { createClaudeCodeCliLoopExecutor } from "../../src/loop/claude-code-cli-executor.js";
import { createCodexCliLoopExecutor } from "../../src/loop/codex-cli-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

// Synthetic child that spawns a grandchild ignoring SIGTERM and keeping the
// stdio pipes open, then hangs. It publishes the grandchild pid as readiness.
const FAKE_CODEX_SOURCE = `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const grandchild = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
  { stdio: ["ignore", "inherit", "inherit"] },
);
writeFileSync(process.env.FAKE_CODEX_PID_PATH, String(grandchild.pid));
setInterval(() => {}, 1000);
`;

// Synthetic provider that ignores SIGTERM and floods stdout when it receives
// it, to prove the output limit cannot short-circuit a cancellation. With
// FAKE_CODEX_FLOOD=0 it simply ignores SIGTERM.
const STUBBORN_SOURCE = `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {
  if (process.env.FAKE_CODEX_FLOOD !== "0") process.stdout.write("x".repeat(200_000));
});
writeFileSync(process.env.FAKE_CODEX_STUBBORN_PID_PATH, String(process.pid));
setInterval(() => {}, 1000);
`;

function plan(provider: "anthropic" | "openai"): LoopExecutionPlan {
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
    provider,
    runtime: provider === "anthropic" ? "claude_code" : "codex",
    profileId: "profile-1",
    model: provider === "anthropic" ? "claude-haiku-4-5" : "gpt-5",
    effort: "low",
    delegation: { mode: "direct_preferred", reason: "low_effort" },
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
  }) as unknown as LoopExecutionPlan;
}

function setup(name: "claude" | "codex") {
  const root = mkdtempSync(join(tmpdir(), `loop-cancel-${name}-`));
  const cwd = join(root, "worktree");
  const executable = join(root, name);
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  const pidPath = join(root, "descendant.pid");
  if (name === "claude") copyFileSync(FAKE_CLAUDE, executable);
  else writeFileSync(executable, FAKE_CODEX_SOURCE);
  chmodSync(executable, 0o755);
  return { root, cwd, executable, pidPath };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (existsSync(path)) {
      const value = Number(readFileSync(path, "utf8").trim());
      if (Number.isSafeInteger(value) && value > 0) return value;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("The synthetic child never signalled readiness.");
}

function killQuietly(pid: number | null): void {
  if (pid === null) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

describe(
  "provider executors — cancellation reaches the real process tree (L7)",
  {
    skip: process.platform === "win32",
  },
  () => {
    for (const name of ["claude", "codex"] as const) {
      it(`10. ${name}: aborting terminates a SIGTERM-ignoring descendant and reports cancellation`, async () => {
        const { root, cwd, executable, pidPath } = setup(name);
        let descendant: number | null = null;
        const previousClaudePid = process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;
        const previousCodexPid = process.env.FAKE_CODEX_PID_PATH;
        process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = pidPath;
        process.env.FAKE_CODEX_PID_PATH = pidPath;
        try {
          const executor =
            name === "claude"
              ? createClaudeCodeCliLoopExecutor({
                  executable,
                  timeoutMs: 60_000,
                })
              : createCodexCliLoopExecutor({ executable, timeoutMs: 60_000 });
          const controller = new AbortController();
          const started = Date.now();
          const pending = executor(
            plan(name === "claude" ? "anthropic" : "openai"),
            cwd,
            { signal: controller.signal },
          );
          descendant = await waitForPid(pidPath);
          assert.equal(alive(descendant), true);

          controller.abort();
          const result = await pending;

          assert.equal(result.status, "failed");
          assert.equal(
            result.status === "failed" ? result.failure.code : null,
            "execution_cancelled",
          );
          assert.equal(alive(descendant), false, "descendant must be dead");
          assert.ok(
            Date.now() - started < 20_000,
            "cancellation must not wait for the provider timeout",
          );
        } finally {
          killQuietly(descendant);
          if (previousClaudePid === undefined)
            delete process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;
          else process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = previousClaudePid;
          if (previousCodexPid === undefined)
            delete process.env.FAKE_CODEX_PID_PATH;
          else process.env.FAKE_CODEX_PID_PATH = previousCodexPid;
          rmSync(root, { recursive: true, force: true });
        }
      });

      it(`${name}: an already-aborted signal never spawns the provider`, async () => {
        const { root, cwd, executable, pidPath } = setup(name);
        const previousClaudePid = process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;
        const previousCodexPid = process.env.FAKE_CODEX_PID_PATH;
        process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = pidPath;
        process.env.FAKE_CODEX_PID_PATH = pidPath;
        try {
          const executor =
            name === "claude"
              ? createClaudeCodeCliLoopExecutor({
                  executable,
                  timeoutMs: 60_000,
                })
              : createCodexCliLoopExecutor({ executable, timeoutMs: 60_000 });
          const controller = new AbortController();
          controller.abort();
          const result = await executor(
            plan(name === "claude" ? "anthropic" : "openai"),
            cwd,
            { signal: controller.signal },
          );
          assert.equal(result.status, "failed");
          assert.equal(
            result.status === "failed" ? result.failure.code : null,
            "execution_cancelled",
          );
          assert.equal(
            existsSync(pidPath),
            false,
            "no provider process may start",
          );
        } finally {
          if (previousClaudePid === undefined)
            delete process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;
          else process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = previousClaudePid;
          if (previousCodexPid === undefined)
            delete process.env.FAKE_CODEX_PID_PATH;
          else process.env.FAKE_CODEX_PID_PATH = previousCodexPid;
          rmSync(root, { recursive: true, force: true });
        }
      });
    }

    for (const name of ["claude", "codex"] as const) {
      for (const scenario of ["output-limit", "inventory-failure"] as const) {
        it(`${name}: ${scenario} during a cancellation never short-circuits or masks it`, async () => {
          const { root, cwd, executable, pidPath } = setup(name);
          writeFileSync(executable, STUBBORN_SOURCE);
          chmodSync(executable, 0o755);
          let pid: number | null = null;
          const previousPid = process.env.FAKE_CODEX_STUBBORN_PID_PATH;
          const previousFlood = process.env.FAKE_CODEX_FLOOD;
          const previousGitDir = process.env.GIT_DIR;
          process.env.FAKE_CODEX_STUBBORN_PID_PATH = pidPath;
          process.env.FAKE_CODEX_FLOOD =
            scenario === "output-limit" ? "1" : "0";
          try {
            const options = {
              executable,
              timeoutMs: 60_000,
              maxOutputBytes: scenario === "output-limit" ? 1_000 : 1_000_000,
            };
            const executor =
              name === "claude"
                ? createClaudeCodeCliLoopExecutor(options)
                : createCodexCliLoopExecutor(options);
            const controller = new AbortController();
            const pending = executor(
              plan(name === "claude" ? "anthropic" : "openai"),
              cwd,
              { signal: controller.signal },
            );
            pid = await waitForPid(pidPath);
            // The inventory runs after the termination: make it fail.
            if (scenario === "inventory-failure")
              process.env.GIT_DIR = join(root, "does-not-exist");
            controller.abort();
            const result = await pending;

            assert.equal(result.status, "failed");
            assert.equal(
              result.status === "failed" ? result.failure.code : null,
              "execution_cancelled",
            );
            assert.equal(
              alive(pid),
              false,
              "the provider must be dead when the executor resolves",
            );
          } finally {
            killQuietly(pid);
            if (previousPid === undefined)
              delete process.env.FAKE_CODEX_STUBBORN_PID_PATH;
            else process.env.FAKE_CODEX_STUBBORN_PID_PATH = previousPid;
            if (previousFlood === undefined)
              delete process.env.FAKE_CODEX_FLOOD;
            else process.env.FAKE_CODEX_FLOOD = previousFlood;
            if (previousGitDir === undefined) delete process.env.GIT_DIR;
            else process.env.GIT_DIR = previousGitDir;
            rmSync(root, { recursive: true, force: true });
          }
        });
      }
    }
  },
);

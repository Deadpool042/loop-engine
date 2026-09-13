import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { createOpenClawNativeLoopExecutor } from "../../src/loop/openclaw-native-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

function setupCleanWorktree(): {
  root: string;
  cwd: string;
  executable: string;
  configPath: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-openclaw-native-"));
  const cwd = join(root, "worktree");
  const executable = join(root, "openclaw");
  const configPath = join(root, "openclaw-auto.json5");
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  writeFileSync(configPath, "{}\n");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
let stdin = "";
for await (const chunk of process.stdin) stdin += chunk.toString("utf8");
const args = process.argv.slice(2);
const captureArgs = process.env.FAKE_OPENCLAW_CAPTURE_ARGS;
const captureCwd = process.env.FAKE_OPENCLAW_CAPTURE_CWD;
const captureEnv = process.env.FAKE_OPENCLAW_CAPTURE_ENV;
const captureStdin = process.env.FAKE_OPENCLAW_CAPTURE_STDIN;
if (captureArgs) writeFileSync(captureArgs, JSON.stringify(args));
if (captureCwd) writeFileSync(captureCwd, process.cwd());
if (captureEnv) writeFileSync(captureEnv, JSON.stringify(process.env));
if (captureStdin) writeFileSync(captureStdin, stdin);
const mode = process.env.FAKE_OPENCLAW_MODE ?? "success";
const modelIndex = args.indexOf("--model");
const requestedModel = modelIndex >= 0 ? String(args[modelIndex + 1] ?? "") : "";
const model = requestedModel.startsWith("openai/") ? requestedModel.slice("openai/".length) : requestedModel;
const emit = (value) => process.stdout.write(JSON.stringify(value));
if (mode === "hang") setInterval(() => {}, 1000);
if (mode === "timeout") { emit({ ok: false, status: "timeout", provider: "openai", model, error: { kind: "timeout", message: "timed out" } }); process.exit(2); }
if (mode === "quota") { emit({ ok: false, status: "error", provider: "openai", model, error: { kind: "rate_limit", message: "limit" } }); process.exit(1); }
if (mode === "auth") { emit({ ok: false, status: "error", provider: null, model: null, error: { kind: "authentication_error", message: "auth" } }); process.exit(1); }
if (mode === "runtime") { emit({ ok: false, status: "error", provider: "openai", model, error: { kind: "runtime_unavailable", message: "runtime" } }); process.exit(1); }
if (mode === "badjson") { process.stdout.write("not-json"); process.exit(1); }
if (mode === "wrong_model") { emit({ ok: true, status: "ok", provider: "openai", model: "gpt-other", sessionId: "session-wrong" }); process.exit(0); }
if (mode === "wrong_provider") { emit({ ok: true, status: "ok", provider: "anthropic", model, sessionId: "session-wrong" }); process.exit(0); }
if (mode === "nonzero_after_write") { writeFileSync("partial.md", "partial\\n"); emit({ ok: false, status: "error", provider: "openai", model, error: { kind: "provider_error", message: "failed" } }); process.exit(1); }
if (mode === "allowed_content") writeFileSync("provider-created.md", "Documentation standard\\n");
if (mode === "forbidden_content") writeFileSync("provider-created.md", "Docker configuration\\n");
emit({ ok: true, status: "ok", final: "done", payloads: [{ text: "done" }], provider: "openai", model, sessionId: "session-1", usage: { input: 10, output: 2, total: 12 }, toolSummary: { calls: 1, tools: ["write"], totalToolTimeMs: 1 } });
`,
  );
  chmodSync(executable, 0o755);
  return {
    root,
    cwd,
    executable,
    configPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function fakePlan(): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-native-1",
    project: { name: "test" },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] test native candidate",
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
    runtime: "openclaw",
    profileId: "configured.openclaw.openai-sol",
    model: "gpt-5.6-sol",
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
      id: "policy-native-1",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  });
}

function createExecutor(input: ReturnType<typeof setupCleanWorktree>) {
  return createOpenClawNativeLoopExecutor({
    executable: input.executable,
    configPath: input.configPath,
    timeoutMs: 5_000,
    hardKillGraceMs: 200,
  });
}

function clearFakeEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("FAKE_OPENCLAW_")) delete process.env[key];
  }
}

describe("createOpenClawNativeLoopExecutor", () => {
  it("requires an openclaw executable, absolute config path and valid limits", () => {
    assert.throws(
      () => createOpenClawNativeLoopExecutor({ executable: "/usr/bin/node", configPath: "/tmp/x.json" }),
      /command named openclaw/,
    );
    assert.throws(
      () => createOpenClawNativeLoopExecutor({ executable: "openclaw", configPath: "relative.json" }),
      /absolute config path/,
    );
    assert.throws(
      () => createOpenClawNativeLoopExecutor({ executable: "openclaw", configPath: "/tmp/x.json", timeoutMs: 0 }),
      /timeout must be a positive integer/,
    );
    assert.throws(
      () => createOpenClawNativeLoopExecutor({ executable: "openclaw", configPath: "/tmp/x.json", hardKillGraceMs: -1 }),
      /hard-kill grace/,
    );
  });

  it("invokes only headless agent exec with pinned config, cwd, model, thinking and stdin prompt", async () => {
    const input = setupCleanWorktree();
    const captureArgs = join(input.root, "args.json");
    const captureCwd = join(input.root, "cwd.txt");
    const captureStdin = join(input.root, "stdin.txt");
    try {
      process.env.FAKE_OPENCLAW_CAPTURE_ARGS = captureArgs;
      process.env.FAKE_OPENCLAW_CAPTURE_CWD = captureCwd;
      process.env.FAKE_OPENCLAW_CAPTURE_STDIN = captureStdin;

      const result = await createExecutor(input)(fakePlan(), input.cwd);

      assert.equal(result.status, "completed");
      const args = JSON.parse(readFileSync(captureArgs, "utf8")) as string[];
      assert.deepEqual(args, [
        "agent",
        "exec",
        "--config",
        resolve(input.configPath),
        "--cwd",
        resolve(input.cwd),
        "--model",
        "openai/gpt-5.6-sol",
        "--thinking",
        "medium",
        "--timeout",
        "5",
        "--json",
        "--message-file",
        "-",
      ]);
      assert.equal(args.includes("--fallback"), false);
      assert.equal(readFileSync(captureCwd, "utf8"), resolve(input.cwd));
      const prompt = readFileSync(captureStdin, "utf8");
      assert.match(prompt, /Candidate: - \[ \] test native candidate/);
      assert.match(prompt, /Stay inside the current worktree\./);
      assert.match(prompt, /Do not commit, push, tag, publish, or expose secrets\./);
      assert.match(prompt, /runtime=openclaw/);
    } finally {
      clearFakeEnv();
      input.cleanup();
    }
  });

  it("does not inherit API keys, GitHub tokens or SSH agent into OpenClaw", async () => {
    const input = setupCleanWorktree();
    const captureEnv = join(input.root, "env.json");
    try {
      process.env.FAKE_OPENCLAW_CAPTURE_ENV = captureEnv;
      process.env.OPENAI_API_KEY = "no";
      process.env.ANTHROPIC_API_KEY = "no";
      process.env.GITHUB_TOKEN = "no";
      process.env.SSH_AUTH_SOCK = "/tmp/no";

      const result = await createExecutor(input)(fakePlan(), input.cwd);

      assert.equal(result.status, "completed");
      const env = JSON.parse(readFileSync(captureEnv, "utf8")) as Record<string, string>;
      assert.equal(env.OPENAI_API_KEY, undefined);
      assert.equal(env.ANTHROPIC_API_KEY, undefined);
      assert.equal(env.GITHUB_TOKEN, undefined);
      assert.equal(env.SSH_AUTH_SOCK, undefined);
      assert.equal(env.HOME, process.env.HOME);
      assert.equal(env.PATH, process.env.PATH);
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.SSH_AUTH_SOCK;
      clearFakeEnv();
      input.cleanup();
    }
  });

  it("fails before native execution when the initial worktree is dirty", async () => {
    const input = setupCleanWorktree();
    const captureArgs = join(input.root, "args.json");
    try {
      writeFileSync(join(input.cwd, "feature.ts"), "export const value = 1;\n");
      process.env.FAKE_OPENCLAW_CAPTURE_ARGS = captureArgs;
      const result = await createExecutor(input)(
        { ...fakePlan(), allowedPaths: ["feature.ts"] },
        input.cwd,
      );

      assert.equal(result.status, "failed");
      assert.equal(result.status === "failed" ? result.failure.code : null, "worktree_not_clean");
      assert.throws(() => readFileSync(captureArgs, "utf8"));
    } finally {
      clearFakeEnv();
      input.cleanup();
    }
  });

  it("supports bounded repair only when the existing delta is inside allowedPaths", async () => {
    const input = setupCleanWorktree();
    try {
      writeFileSync(join(input.cwd, "feature.ts"), "export const value = 1;\n");
      const result = await createExecutor(input)(
        { ...fakePlan(), allowedPaths: ["feature.ts"], worktreeMode: "repair_existing" },
        input.cwd,
      );
      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["feature.ts"]);
    } finally {
      input.cleanup();
    }
  });

  it("fails closed when the execution plan is not OpenClaw + OpenAI", async () => {
    const input = setupCleanWorktree();
    try {
      const wrongRuntime = await createExecutor(input)(
        { ...fakePlan(), runtime: "codex" },
        input.cwd,
      );
      assert.equal(wrongRuntime.status, "failed");
      assert.equal(
        wrongRuntime.status === "failed" ? wrongRuntime.failure.code : null,
        "execution_plan_provider_mismatch",
      );
      const wrongModel = await createExecutor(input)(
        { ...fakePlan(), model: "anthropic/claude-sonnet" },
        input.cwd,
      );
      assert.equal(wrongModel.status, "failed");
      assert.equal(
        wrongModel.status === "failed" ? wrongModel.failure.code : null,
        "execution_plan_model_mismatch",
      );
    } finally {
      input.cleanup();
    }
  });

  it("rejects a successful envelope when OpenClaw used a different provider or model", async () => {
    for (const mode of ["wrong_model", "wrong_provider"] as const) {
      const input = setupCleanWorktree();
      try {
        process.env.FAKE_OPENCLAW_MODE = mode;
        const result = await createExecutor(input)(fakePlan(), input.cwd);
        assert.equal(result.status, "failed");
        assert.equal(
          result.status === "failed" ? result.failure.code : null,
          "execution_plan_model_mismatch",
        );
      } finally {
        clearFakeEnv();
        input.cleanup();
      }
    }
  });

  it("maps the stable timeout envelope and outer hard timeout to provider_timeout", async () => {
    const input = setupCleanWorktree();
    try {
      process.env.FAKE_OPENCLAW_MODE = "timeout";
      const nativeTimeout = await createExecutor(input)(fakePlan(), input.cwd);
      assert.equal(nativeTimeout.status, "failed");
      assert.equal(
        nativeTimeout.status === "failed" ? nativeTimeout.failure.code : null,
        "provider_timeout",
      );

      process.env.FAKE_OPENCLAW_MODE = "hang";
      const outerTimeout = await createOpenClawNativeLoopExecutor({
        executable: input.executable,
        configPath: input.configPath,
        timeoutMs: 50,
        hardKillGraceMs: 50,
      })(fakePlan(), input.cwd);
      assert.equal(outerTimeout.status, "failed");
      assert.equal(
        outerTimeout.status === "failed" ? outerTimeout.failure.code : null,
        "provider_timeout",
      );
    } finally {
      clearFakeEnv();
      input.cleanup();
    }
  });

  it("maps structured quota, auth and runtime failures without exposing provider text", async () => {
    const expected = new Map([
      ["quota", "provider_rate_limited"],
      ["auth", "provider_unavailable"],
      ["runtime", "runtime_unavailable"],
    ]);
    for (const [mode, code] of expected) {
      const input = setupCleanWorktree();
      try {
        process.env.FAKE_OPENCLAW_MODE = mode;
        const result = await createExecutor(input)(fakePlan(), input.cwd);
        assert.equal(result.status, "failed");
        assert.equal(result.status === "failed" ? result.failure.code : null, code);
        assert.equal(JSON.stringify(result).includes('"message":"limit"'), false);
        assert.equal(JSON.stringify(result).includes('"message":"auth"'), false);
        assert.equal(JSON.stringify(result).includes('"message":"runtime"'), false);
      } finally {
        clearFakeEnv();
        input.cleanup();
      }
    }
  });

  it("fails closed on an invalid JSON envelope and preserves modified files after a provider failure", async () => {
    const input = setupCleanWorktree();
    try {
      process.env.FAKE_OPENCLAW_MODE = "badjson";
      const badJson = await createExecutor(input)(fakePlan(), input.cwd);
      assert.equal(badJson.status, "failed");
      assert.equal(badJson.status === "failed" ? badJson.failure.code : null, "provider_failed");

      process.env.FAKE_OPENCLAW_MODE = "nonzero_after_write";
      const partial = await createExecutor(input)(fakePlan(), input.cwd);
      assert.equal(partial.status, "failed");
      assert.equal(partial.status === "failed" ? partial.failure.code : null, "provider_failed");
      assert.deepEqual(partial.modifiedFiles, ["partial.md"]);
    } finally {
      clearFakeEnv();
      input.cleanup();
    }
  });

  it("keeps the existing content-policy gate after native execution", async () => {
    for (const [mode, expectedStatus] of [
      ["allowed_content", "completed"],
      ["forbidden_content", "failed"],
    ] as const) {
      const input = setupCleanWorktree();
      try {
        process.env.FAKE_OPENCLAW_MODE = mode;
        const result = await createExecutor(input)(
          {
            ...fakePlan(),
            brief: {
              objective: "Write a documentation standard.",
              deliverables: ["provider-created.md"],
              outOfScope: ["Infrastructure configuration"],
              forbiddenContentTerms: ["docker"],
            },
          },
          input.cwd,
        );
        assert.equal(result.status, expectedStatus);
        if (result.status === "failed") {
          assert.equal(result.failure.code, "content_policy_violation");
        }
      } finally {
        clearFakeEnv();
        input.cleanup();
      }
    }
  });
});

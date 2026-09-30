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
import { join } from "node:path";
import { describe, it } from "node:test";

import { createHermesCopilotCliLoopExecutor } from "../../src/loop/hermes-copilot-cli-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

function setupCleanWorktree(): {
  cwd: string;
  executable: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-hermes-copilot-test-"));
  const cwd = join(root, "worktree");
  const executable = join(root, "hermes");
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });

  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const captureArgs = process.env.FAKE_HERMES_CAPTURE_ARGS;
const captureEnv = process.env.FAKE_HERMES_CAPTURE_ENV;
const capturePrompt = process.env.FAKE_HERMES_CAPTURE_PROMPT;
if (captureArgs) writeFileSync(captureArgs, JSON.stringify(args));
if (captureEnv) writeFileSync(captureEnv, JSON.stringify(process.env));
let prompt = "";
try { prompt = readFileSync(0, "utf8"); } catch {}
if (capturePrompt) writeFileSync(capturePrompt, prompt);
const usageIndex = args.indexOf("--usage-file");
const usagePath = usageIndex >= 0 ? args[usageIndex + 1] : null;
const modelIndex = args.indexOf("--model");
const model = modelIndex >= 0 ? args[modelIndex + 1] : null;
const mode = process.env.FAKE_HERMES_MODE ?? "success";
if (mode === "hang") setInterval(() => {}, 1000);
if (mode === "nonzero") process.exit(9);
if (mode === "write") writeFileSync("provider-created.md", "Copilot bounded change\\n");
if (mode === "forbidden_tool") {
  process.stdout.write(JSON.stringify({ type: "tool_use", name: "terminal", input: {} }) + "\\n");
}
if (usagePath && mode !== "no_usage") {
  writeFileSync(
    usagePath,
    JSON.stringify({
      provider: mode === "wrong_provider" ? "openai-codex" : "copilot",
      model: mode === "wrong_model" ? "other-model" : model,
      completed: true,
      failed: false,
    }),
  );
}
process.stdout.write(JSON.stringify({ type: "system", subtype: "init", model }) + "\\n");
process.stdout.write(JSON.stringify({ type: "tool_use", name: "write_file", input: { path: "provider-created.md" } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "result", exit_code: 0, text: "done" }) + "\\n");
`,
  );
  chmodSync(executable, 0o755);
  return {
    cwd,
    executable,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function fakePlan(): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: "run-copilot-1",
    project: { name: "test" },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] bounded change",
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
    provider: "github",
    runtime: "copilot",
    profileId: "configured.copilot.luna",
    model: "gpt-6-luna",
    effort: "low",
    delegation: {
      mode: "direct_preferred",
      reason: "low_effort",
    },
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: 360_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
    policy: {
      id: "auto-subscription",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: ["code_edit"],
      requiredPermissions: ["read_only", "write_worktree"],
      allowedFundingModes: ["included_subscription"],
      rationale: [],
    },
  });
}

describe("createHermesCopilotCliLoopExecutor", () => {
  it("accepts only an executable named hermes", () => {
    assert.throws(
      () => createHermesCopilotCliLoopExecutor({ executable: "/usr/bin/node" }),
      /command named hermes/,
    );
    assert.equal(
      typeof createHermesCopilotCliLoopExecutor({ executable: "/usr/local/bin/hermes" }),
      "function",
    );
  });

  it("forces Copilot, model, reasoning and the file-only Hermes toolset", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const argsPath = join(cwd, "../args.json");
    const promptPath = join(cwd, "../prompt.txt");
    try {
      process.env.FAKE_HERMES_CAPTURE_ARGS = argsPath;
      process.env.FAKE_HERMES_CAPTURE_PROMPT = promptPath;
      process.env.FAKE_HERMES_MODE = "write";
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(), cwd);

      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["provider-created.md"]);
      const args = JSON.parse(readFileSync(argsPath, "utf8")) as string[];
      assert.equal(args.includes("--provider"), true);
      assert.equal(args[args.indexOf("--provider") + 1], "copilot");
      assert.equal(args[args.indexOf("--model") + 1], "gpt-6-luna");
      assert.equal(args[args.indexOf("--reasoning") + 1], "low");
      assert.equal(args[args.indexOf("--toolsets") + 1], "file");
      assert.equal(args.includes("terminal"), false);
      assert.equal(args.includes("code_execution"), false);
      assert.equal(args.includes("mcp"), false);
      assert.equal(args[args.indexOf("--query-file") + 1], "-");
      const prompt = readFileSync(promptPath, "utf8");
      assert.match(prompt, /Stay inside the current worktree/);
      assert.match(prompt, /Do not commit, push, tag, publish, or expose secrets/);
    } finally {
      delete process.env.FAKE_HERMES_CAPTURE_ARGS;
      delete process.env.FAKE_HERMES_CAPTURE_PROMPT;
      delete process.env.FAKE_HERMES_MODE;
      cleanup();
    }
  });

  it("does not inherit API key or token environment variables", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    const envPath = join(cwd, "../env.json");
    try {
      process.env.FAKE_HERMES_CAPTURE_ENV = envPath;
      process.env.OPENAI_API_KEY = "no";
      process.env.ANTHROPIC_API_KEY = "no";
      process.env.GITHUB_TOKEN = "no";
      process.env.FAKE_HERMES_MODE = "write";
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(), cwd);

      assert.equal(result.status, "completed");
      const childEnv = JSON.parse(readFileSync(envPath, "utf8")) as Record<string, string>;
      assert.equal(childEnv.OPENAI_API_KEY, undefined);
      assert.equal(childEnv.ANTHROPIC_API_KEY, undefined);
      assert.equal(childEnv.GITHUB_TOKEN, undefined);
      assert.equal(childEnv.HOME, process.env.HOME);
    } finally {
      delete process.env.FAKE_HERMES_CAPTURE_ENV;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.FAKE_HERMES_MODE;
      cleanup();
    }
  });

  it("uses the forced Copilot provider plus stream model when chat usage evidence is absent", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_HERMES_MODE = "no_usage";
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(), cwd);
      assert.equal(result.status, "completed");
    } finally {
      delete process.env.FAKE_HERMES_MODE;
      cleanup();
    }
  });

  it("fails closed when Hermes reports another provider or model", async () => {
    for (const mode of ["wrong_provider", "wrong_model"]) {
      const { cwd, executable, cleanup } = setupCleanWorktree();
      try {
        process.env.FAKE_HERMES_MODE = mode;
        const result = await createHermesCopilotCliLoopExecutor({
          executable,
          timeoutMs: 5_000,
        })(fakePlan(), cwd);
        assert.equal(result.status, "failed");
        assert.equal(
          result.status === "failed" ? result.failure.code : null,
          "execution_plan_model_mismatch",
        );
      } finally {
        delete process.env.FAKE_HERMES_MODE;
        cleanup();
      }
    }
  });

  it("fails closed if a forbidden Hermes tool appears in the stream", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      process.env.FAKE_HERMES_MODE = "forbidden_tool";
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(), cwd);
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "provider_forbidden_tool",
      );
    } finally {
      delete process.env.FAKE_HERMES_MODE;
      cleanup();
    }
  });

  it("rejects a dirty initial worktree before starting Hermes", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      writeFileSync(join(cwd, "dirty.ts"), "export const dirty = true;\n");
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(fakePlan(), cwd);
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "worktree_not_clean",
      );
    } finally {
      cleanup();
    }
  });

  it("rejects any plan not explicitly assigned to github/copilot", async () => {
    const { cwd, executable, cleanup } = setupCleanWorktree();
    try {
      const result = await createHermesCopilotCliLoopExecutor({
        executable,
        timeoutMs: 5_000,
      })(
        { ...fakePlan(), provider: "openai", runtime: "codex" },
        cwd,
      );
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" ? result.failure.code : null,
        "execution_plan_provider_mismatch",
      );
    } finally {
      cleanup();
    }
  });
});

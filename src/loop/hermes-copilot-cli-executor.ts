import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import { buildLoopExecutionPrompt } from "./codex-cli-executor.js";
import { inspectWorktreeContentPolicy } from "./content-policy.js";
import { admitProviderWorktree } from "./provider-worktree-admission.js";
import { buildSubscriptionCliEnvironment } from "./subscription-cli-environment.js";
import { readModifiedWorktreeFiles } from "./worktree-status.js";

export type HermesCopilotCliLoopExecutorOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxTurns?: number;
}>;

type ProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimitExceeded: boolean;
}>;

type HermesUsage = Readonly<{
  provider?: unknown;
  model?: unknown;
  completed?: unknown;
  failed?: unknown;
}>;

const FORBIDDEN_HERMES_TOOLS = Object.freeze([
  "terminal",
  "execute_code",
  "code_execution",
  "computer_use",
  "browser",
  "web_search",
  "web_extract",
  "delegate_task",
  "tool_call",
  "mcp",
] as const);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: string,
  message: string,
  modifiedFiles: readonly string[] = [],
): LoopExecutorResult {
  return Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([...modifiedFiles]),
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze([
        "Hermes Copilot execution diagnostics are redacted.",
      ]),
    }),
  });
}

function parseJsonLines(stdout: string): readonly Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        events.push(value as Record<string, unknown>);
      }
    } catch {
      // stream-json may only be trusted through valid JSONL records.
    }
  }
  return Object.freeze(events);
}

function toolName(event: Record<string, unknown>): string | null {
  return event.type === "tool_use" && typeof event.name === "string"
    ? event.name
    : null;
}

function observedModel(
  events: readonly Record<string, unknown>[],
): string | null {
  const init = events.find(
    (event) => event.type === "system" && event.subtype === "init",
  );
  return init && typeof init.model === "string" ? init.model : null;
}

function containsForbiddenTool(events: readonly Record<string, unknown>[]): boolean {
  return events.some((event) => {
    const name = toolName(event);
    if (name === null) return false;
    const normalized = name.toLowerCase();
    return FORBIDDEN_HERMES_TOOLS.some(
      (forbidden) =>
        normalized === forbidden ||
        normalized.startsWith(`${forbidden}.`) ||
        normalized.startsWith(`${forbidden}_`) ||
        normalized.startsWith(`mcp__`),
    );
  });
}

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<ProcessResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildSubscriptionCliEnvironment(),
    });
    let stdout = "";
    let stderr = "";
    let observedBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputLimitExceeded = false;
    let timer: NodeJS.Timeout | null = null;

    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolvePromise(
        Object.freeze({
          exitCode,
          stdout,
          stderr,
          timedOut,
          outputLimitExceeded,
        }),
      );
    };

    const consume = (chunk: Buffer, channel: "stdout" | "stderr"): void => {
      observedBytes += chunk.byteLength;
      if (observedBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        settle(124);
        return;
      }
      if (channel === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };

    child.stdout.on("data", (chunk: Buffer) => consume(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, "stderr"));
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
    child.stdin.end(stdin, "utf8");

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      settle(124);
    }, timeoutMs);
  });
}

async function readUsage(path: string): Promise<HermesUsage | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as HermesUsage)
      : null;
  } catch {
    return null;
  }
}

export function createHermesCopilotCliLoopExecutor(
  options: HermesCopilotCliLoopExecutorOptions,
): LoopExecutor {
  if (
    !isNonEmptyString(options.executable) ||
    basename(options.executable.trim()) !== "hermes"
  ) {
    throw new TypeError(
      "Hermes Copilot executable must resolve to a command named hermes.",
    );
  }

  const timeoutMs = options.timeoutMs ?? 360_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  const maxTurns = options.maxTurns ?? 12;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Hermes Copilot timeout must be a positive integer.");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError(
      "Hermes Copilot output limit must be a positive integer.",
    );
  }
  if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
    throw new TypeError("Hermes Copilot maxTurns must be a positive integer.");
  }

  const executable = options.executable.trim();

  return async (plan: LoopExecutionPlan, executionCwd: string) => {
    if (plan.provider !== "github" || plan.runtime !== "copilot") {
      return failure(
        "execution_plan_provider_mismatch",
        "The execution plan is not assigned to the governed Copilot runtime.",
      );
    }
    if (
      isNonEmptyString(options.model) &&
      options.model.trim() !== plan.model
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "The configured Copilot model does not match the execution plan.",
      );
    }

    const cwd = resolve(executionCwd);
    const before = await readModifiedWorktreeFiles(cwd);
    if (before === null) {
      return failure(
        "worktree_status_failed",
        "Unable to verify the Copilot provider worktree.",
      );
    }
    const admission = admitProviderWorktree(plan, before);
    if (!admission.ok) {
      return failure(admission.code, admission.message, before);
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "loop-hermes-copilot-"));
    const usagePath = join(tempRoot, "usage.json");
    const args = [
      "chat",
      "--oneshot",
      "--usage-file",
      usagePath,
      "--format",
      "stream-json",
      "--max-turns",
      String(maxTurns),
      "--source",
      "tool",
      "--provider",
      "copilot",
      "--model",
      plan.model,
      "--reasoning",
      plan.effort,
      "--toolsets",
      "file",
      "--query-file",
      "-",
    ];

    let result: ProcessResult;
    let usage: HermesUsage | null = null;
    try {
      result = await runProcess(
        executable,
        args,
        cwd,
        buildLoopExecutionPrompt(plan),
        timeoutMs,
        maxOutputBytes,
      );
      usage = await readUsage(usagePath);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }

    const modifiedFiles = await readModifiedWorktreeFiles(cwd);
    if (modifiedFiles === null) {
      return failure(
        "worktree_status_failed",
        "Unable to inspect Copilot provider modifications.",
      );
    }
    if (result.timedOut) {
      return failure(
        "provider_timeout",
        "Hermes Copilot execution exceeded the configured timeout.",
        modifiedFiles,
      );
    }
    if (result.outputLimitExceeded) {
      return failure(
        "provider_limit_exceeded",
        "Hermes Copilot execution exceeded the configured output limit.",
        modifiedFiles,
      );
    }
    if (result.exitCode === 127) {
      return failure(
        "provider_unavailable",
        "Hermes CLI is unavailable for the Copilot runtime.",
        modifiedFiles,
      );
    }

    const events = parseJsonLines(result.stdout);
    if (containsForbiddenTool(events)) {
      return failure(
        "provider_forbidden_tool",
        "Hermes Copilot attempted a tool outside the file-only execution boundary.",
        modifiedFiles,
      );
    }
    if (result.exitCode !== 0) {
      return failure(
        "provider_failed",
        "Hermes Copilot CLI execution failed.",
        modifiedFiles,
      );
    }

    const streamModel = observedModel(events);
    if (streamModel !== plan.model) {
      return failure(
        "execution_plan_model_mismatch",
        "Hermes did not run the model selected by Loop Engine.",
        modifiedFiles,
      );
    }
    if (usage === null) {
      return failure(
        "execution_plan_model_mismatch",
        "Hermes did not provide usage evidence for the governed Copilot execution.",
        modifiedFiles,
      );
    }

    if (
      usage.completed !== true ||
      usage.failed === true ||
      usage.provider !== "copilot" ||
      usage.model !== plan.model
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "Hermes usage evidence contradicts the Copilot provider/model selected by Loop Engine.",
        modifiedFiles,
      );
    }

    const contentPolicy = await inspectWorktreeContentPolicy(
      plan,
      cwd,
      modifiedFiles,
    );
    if (contentPolicy.outcome === "violation") {
      return failure(
        "content_policy_violation",
        "Generated content violates the governed mission constraints.",
        modifiedFiles,
      );
    }
    if (contentPolicy.outcome === "uninspectable") {
      return failure(
        "content_policy_inspection_failed",
        "Generated content could not be verified against the governed mission constraints.",
        modifiedFiles,
      );
    }

    return Object.freeze({
      status: "completed" as const,
      modifiedFiles,
      details: Object.freeze([
        `Hermes Copilot completed execution plan for ${plan.profileId} (${plan.model}).`,
      ]),
    });
  };
}

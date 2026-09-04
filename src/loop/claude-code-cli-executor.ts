import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

import { inspectWorktreeContentPolicy } from "./content-policy.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import { buildLoopRuntimeDelegationGuidance } from "./runtime-delegation.js";
import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import { readModifiedWorktreeFiles } from "./worktree-status.js";

export type ClaudeCodeCliLoopExecutorOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxTurns?: number;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildPrompt(plan: LoopExecutionPlan): string {
  const files = plan.contextPackage.files.map((file) => file.path).join(", ");
  return [
    "Implement exactly one reviewed Loop Engine roadmap candidate in the current repository.",
    `Candidate: ${plan.candidate.text}`,
    `Project: ${plan.project.name}`,
    `Execution plan: provider=${plan.provider}, runtime=${plan.runtime}, profile=${plan.profileId}, model=${plan.model}, effort=${plan.effort}`,
    `Allowed context files: ${files || "none"}`,
    ...(plan.allowedPaths === undefined
      ? []
      : [
          "Writable file scope:",
          ...plan.allowedPaths.map((path) => `- ${path}`),
          "Do not modify files outside this scope.",
        ]),
    ...(plan.brief === undefined
      ? ["Do not modify the roadmap or mark the selected candidate complete."]
      : [
          "Governed mission brief:",
          `Objective: ${plan.brief.objective}`,
          "Required deliverables:",
          ...plan.brief.deliverables.map((deliverable) => `- ${deliverable}`),
          "Out of scope:",
          ...plan.brief.outOfScope.map((item) => `- ${item}`),
          ...(plan.brief.forbiddenContentTerms === undefined
            ? []
            : [
                "Forbidden content terms (literal, case-insensitive):",
                ...plan.brief.forbiddenContentTerms.map((term) => `- ${term}`),
                "The output is rejected if any forbidden content term appears.",
              ]),
          "Produce every required deliverable, but only within the writable file scope.",
        ]),
    ...buildLoopRuntimeDelegationGuidance(plan.delegation),
    "Stay inside the current worktree. Do not commit, push, tag, publish, alter credentials, or expose secrets.",
    "Implement only the target files explicitly named by the selected candidate.",
    "Finish by leaving only the intended source changes in the worktree.",
  ].join("\n");
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
        "Provider output and process diagnostics are redacted.",
      ]),
    }),
  });
}

type RunProcessOutcome = Readonly<{
  exitCode: number;
  stdout: string;
  killedReason: "timeout" | "output_limit" | null;
}>;

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<RunProcessOutcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    });
    let stdout = "";
    let observedBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const settle = (
      exitCode: number,
      killedReason: RunProcessOutcome["killedReason"] = null,
    ): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolvePromise(Object.freeze({ exitCode, stdout, killedReason }));
    };
    const consume = (chunk: Buffer, capture: boolean): void => {
      observedBytes += chunk.byteLength;
      if (observedBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        settle(124, "output_limit");
        return;
      }
      if (capture) stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => consume(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, false));
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(124, "timeout");
    }, timeoutMs);
  });
}

type ClaudeCodeCliJsonOutput = Readonly<{
  is_error?: boolean;
  subtype?: string;
}>;

function parseClaudeCodeJsonOutput(
  stdout: string,
): ClaudeCodeCliJsonOutput | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return parsed as ClaudeCodeCliJsonOutput;
  } catch {
    return null;
  }
}

export function createClaudeCodeCliLoopExecutor(
  options: ClaudeCodeCliLoopExecutorOptions,
): LoopExecutor {
  if (
    !isNonEmptyString(options.executable) ||
    basename(options.executable.trim()) !== "claude"
  ) {
    throw new TypeError(
      "Claude Code executable must resolve to a command named claude.",
    );
  }
  const timeoutMs = options.timeoutMs ?? 600_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  const maxTurns = options.maxTurns ?? 20;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Claude Code timeout must be a positive integer.");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError("Claude Code output limit must be a positive integer.");
  }
  if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
    throw new TypeError("Claude Code maxTurns must be a positive integer.");
  }

  return async (plan, executionCwd): Promise<LoopExecutorResult> => {
    if (plan.provider !== "anthropic" || plan.runtime !== "claude_code") {
      return failure(
        "execution_plan_provider_mismatch",
        "The execution plan is not assigned to the Claude Code provider.",
      );
    }
    if (
      isNonEmptyString(options.model) &&
      options.model.trim() !== plan.model
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "The configured Claude model does not match the execution plan.",
      );
    }

    const cwd = resolve(executionCwd);
    const before = await readModifiedWorktreeFiles(cwd);
    if (before === null) {
      return failure(
        "worktree_status_failed",
        "Unable to verify the provider worktree.",
      );
    }
    if (before.length > 0) {
      return failure(
        "worktree_not_clean",
        "Claude Code execution requires a clean worktree.",
      );
    }

    const args = [
      "--print",
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--max-turns",
      String(maxTurns),
      "--model",
      plan.model,
      buildPrompt(plan),
    ];
    const result = await runProcess(
      options.executable.trim(),
      args,
      cwd,
      timeoutMs,
      maxOutputBytes,
    );

    const modifiedFiles = await readModifiedWorktreeFiles(cwd);

    if (modifiedFiles === null) {
      return failure(
        "worktree_status_failed",
        "Unable to inspect provider modifications.",
      );
    }

    if (result.killedReason === "timeout") {
      return failure(
        "provider_timeout",
        "Claude Code execution exceeded the configured timeout.",
        modifiedFiles,
      );
    }
    if (result.killedReason === "output_limit") {
      return failure(
        "provider_limit_exceeded",
        "Claude Code execution exceeded the configured output limit.",
        modifiedFiles,
      );
    }
    if (result.exitCode === 127) {
      return failure(
        "provider_unavailable",
        "Claude Code CLI is unavailable.",
        modifiedFiles,
      );
    }

    const output = parseClaudeCodeJsonOutput(result.stdout);
    if (output?.is_error === true && output.subtype === "error_max_turns") {
      return failure(
        "provider_max_turns",
        "Claude Code exhausted the configured turn limit.",
        modifiedFiles,
      );
    }
    if (result.exitCode !== 0) {
      return failure(
        "provider_failed",
        "Claude Code CLI execution failed.",
        modifiedFiles,
      );
    }
    if (output === null) {
      return failure(
        "provider_invalid_output",
        "Claude Code CLI produced output that could not be parsed.",
        modifiedFiles,
      );
    }
    if (output.is_error === true) {
      return failure(
        "provider_reported_error",
        "Claude Code reported an error for this execution.",
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
        `Claude Code completed execution plan for ${plan.profileId} (${plan.model}).`,
      ]),
    });
  };
}

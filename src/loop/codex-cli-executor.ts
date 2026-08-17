import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import type { LoopExecutionPlan } from "./execution-plan.js";

export type CodexCliLoopExecutorOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
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
    "Stay inside the current worktree. Do not commit, push, tag, publish, or expose secrets.",
    "Finish by leaving the intended source changes in the worktree.",
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

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<Readonly<{ exitCode: number; stdout: string }>> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let observedBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolvePromise(Object.freeze({ exitCode, stdout }));
    };
    const consume = (chunk: Buffer, capture: boolean): void => {
      observedBytes += chunk.byteLength;
      if (observedBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        settle(124);
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
      settle(124);
    }, timeoutMs);
  });
}

function parsePorcelainFiles(output: string): readonly string[] {
  const entries = output.split("\0");
  const files = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path.length > 0) files.add(path);
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return Object.freeze([...files].sort());
}

async function readModifiedFiles(
  cwd: string,
): Promise<readonly string[] | null> {
  const result = await runProcess(
    "git",
    ["status", "--porcelain=v1", "-z"],
    cwd,
    10_000,
    1_000_000,
  );
  return result.exitCode === 0 ? parsePorcelainFiles(result.stdout) : null;
}

export function createCodexCliLoopExecutor(
  options: CodexCliLoopExecutorOptions,
): LoopExecutor {
  if (
    !isNonEmptyString(options.executable) ||
    basename(options.executable.trim()) !== "codex"
  ) {
    throw new TypeError(
      "Codex executable must resolve to a command named codex.",
    );
  }
  const timeoutMs = options.timeoutMs ?? 300_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Codex timeout must be a positive integer.");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError("Codex output limit must be a positive integer.");
  }

  return async (plan): Promise<LoopExecutorResult> => {
    if (plan.provider !== "openai" || plan.runtime !== "codex") {
      return failure(
        "execution_plan_provider_mismatch",
        "The execution plan is not assigned to the Codex provider.",
      );
    }
    if (
      isNonEmptyString(options.model) &&
      options.model.trim() !== plan.model
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "The configured Codex model does not match the execution plan.",
      );
    }

    const cwd = resolve(plan.project.path);
    const before = await readModifiedFiles(cwd);
    if (before === null)
      return failure(
        "worktree_status_failed",
        "Unable to verify the provider worktree.",
      );
    if (before.length > 0)
      return failure(
        "worktree_not_clean",
        "Codex execution requires a clean worktree.",
      );

    const args = [
      "exec",
      "--sandbox",
      "workspace-write",
      "--model",
      plan.model,
      "--json",
    ];
    args.push(buildPrompt(plan));
    const result = await runProcess(
      options.executable.trim(),
      args,
      cwd,
      timeoutMs,
      maxOutputBytes,
    );
    const modifiedFiles = await readModifiedFiles(cwd);
    if (modifiedFiles === null)
      return failure(
        "worktree_status_failed",
        "Unable to inspect provider modifications.",
      );
    if (result.exitCode === 124)
      return failure(
        "provider_limit_exceeded",
        "Codex execution exceeded a configured limit.",
        modifiedFiles,
      );
    if (result.exitCode !== 0)
      return failure(
        "provider_failed",
        "Codex CLI execution failed.",
        modifiedFiles,
      );
    return Object.freeze({
      status: "completed" as const,
      modifiedFiles,
      details: Object.freeze([
        `Codex CLI completed execution plan for ${plan.profileId} (${plan.model}).`,
      ]),
    });
  };
}

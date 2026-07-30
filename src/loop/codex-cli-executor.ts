import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { LoopExecutor, LoopExecutorInput, LoopExecutorResult } from "./execution.js";

export type CodexCliLoopExecutorOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildPrompt(input: LoopExecutorInput): string {
  const files = input.contextPackage.files.map((file) => file.path).join(", ");
  return [
    "Implement exactly one reviewed Loop Engine roadmap candidate in the current repository.",
    `Candidate: ${input.candidate.text}`,
    `Project: ${input.project.name}`,
    `Allowed context files: ${files || "none"}`,
    "Stay inside the current worktree. Do not commit, push, tag, publish, or expose secrets.",
    "Finish by leaving the intended source changes in the worktree.",
  ].join("\n");
}

function failure(code: string, message: string): LoopExecutorResult {
  return Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([]),
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze(["Provider output and process diagnostics are redacted."]),
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
      env: process.env,
    });
    let stdout = "";
    let observedBytes = 0;
    let settled = false;
    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(124);
    }, timeoutMs);
  });
}

async function readModifiedFiles(cwd: string): Promise<readonly string[]> {
  const result = await runProcess("git", ["status", "--porcelain=v1", "-z"], cwd, 10_000, 1_000_000);
  if (result.exitCode !== 0) return Object.freeze([]);
  const files = result.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).trim())
    .filter(Boolean);
  return Object.freeze([...new Set(files)].sort());
}

export function createCodexCliLoopExecutor(
  options: CodexCliLoopExecutorOptions,
): LoopExecutor {
  if (!isNonEmptyString(options.executable)) {
    throw new TypeError("Codex executable must be a non-empty string.");
  }
  const timeoutMs = options.timeoutMs ?? 300_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Codex timeout must be a positive integer.");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError("Codex output limit must be a positive integer.");
  }

  return async (input): Promise<LoopExecutorResult> => {
    const cwd = resolve(input.project.path);
    const args = ["exec", "--full-auto"];
    if (isNonEmptyString(options.model)) args.push("--model", options.model.trim());
    args.push(buildPrompt(input));
    const result = await runProcess(options.executable, args, cwd, timeoutMs, maxOutputBytes);
    if (result.exitCode === 124) return failure("provider_limit_exceeded", "Codex execution exceeded a configured limit.");
    if (result.exitCode !== 0) return failure("provider_failed", "Codex CLI execution failed.");
    const modifiedFiles = await readModifiedFiles(cwd);
    return Object.freeze({
      status: "completed" as const,
      modifiedFiles,
      details: Object.freeze(["Codex CLI completed through the guarded local-process pilot."]),
    });
  };
}

import { spawn } from "node:child_process";
import { basename, isAbsolute, resolve } from "node:path";

import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import { buildLoopExecutionPrompt } from "./codex-cli-executor.js";
import { inspectWorktreeContentPolicy } from "./content-policy.js";
import { admitProviderWorktree } from "./provider-worktree-admission.js";
import { buildSubscriptionCliEnvironment } from "./subscription-cli-environment.js";
import { readModifiedWorktreeFiles } from "./worktree-status.js";

export type OpenClawNativeLoopExecutorOptions = Readonly<{
  executable: string;
  configPath: string;
  timeoutMs?: number;
  hardKillGraceMs?: number;
  maxOutputBytes?: number;
}>;

type OpenClawExecEnvelope = Readonly<{
  ok: boolean;
  status: "ok" | "error" | "timeout";
  provider: string | null;
  model: string | null;
  sessionId?: string;
  error?: Readonly<{
    message?: string;
    kind?: string;
  }>;
}>;

type ProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
  hardTimedOut: boolean;
  outputLimitExceeded: boolean;
}>;

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
        "OpenClaw native execution diagnostics are redacted.",
      ]),
    }),
  });
}

function normalizeOpenAiModel(model: string): string | null {
  const normalized = model.trim();
  if (!normalized) return null;
  if (!normalized.includes("/")) return normalized;
  const [provider, ...parts] = normalized.split("/");
  if (provider !== "openai" || parts.length === 0) return null;
  const modelId = parts.join("/").trim();
  return modelId.length > 0 ? modelId : null;
}

function openClawModelRef(model: string): string | null {
  const modelId = normalizeOpenAiModel(model);
  return modelId === null ? null : `openai/${modelId}`;
}

function parseEnvelope(stdout: string): OpenClawExecEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.ok !== "boolean" ||
    (value.status !== "ok" && value.status !== "error" && value.status !== "timeout") ||
    !(typeof value.provider === "string" || value.provider === null) ||
    !(typeof value.model === "string" || value.model === null)
  ) {
    return null;
  }
  const errorValue = value.error;
  let error: OpenClawExecEnvelope["error"] | undefined;
  if (typeof errorValue === "object" && errorValue !== null && !Array.isArray(errorValue)) {
    const errorRecord = errorValue as Record<string, unknown>;
    const message = typeof errorRecord.message === "string" ? errorRecord.message : null;
    const kind = typeof errorRecord.kind === "string" ? errorRecord.kind : null;
    error = Object.freeze({
      ...(message === null ? {} : { message }),
      ...(kind === null ? {} : { kind }),
    });
  }

  return Object.freeze({
    ok: value.ok,
    status: value.status,
    provider: value.provider,
    model: value.model,
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
    ...(error === undefined ? {} : { error: Object.freeze(error) }),
  });
}

function classifyStructuredFailure(envelope: OpenClawExecEnvelope): string {
  if (envelope.status === "timeout") return "provider_timeout";
  const kind = envelope.error?.kind?.trim().toLowerCase() ?? "";
  if (/(?:quota|rate[_ -]?limit|usage[_ -]?limit|limit[_ -]?exceeded)/.test(kind)) {
    return "provider_rate_limited";
  }
  if (/(?:auth|credential|login|unauthori[sz]ed)/.test(kind)) {
    return "provider_unavailable";
  }
  if (/(?:runtime|harness|plugin|provider)[_ -]?(?:missing|unavailable|not[_ -]?found)/.test(kind)) {
    return "runtime_unavailable";
  }
  return "provider_failed";
}

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  stdin: string,
  hardTimeoutMs: number,
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
    let hardTimedOut = false;
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
          hardTimedOut,
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
      hardTimedOut = true;
      child.kill("SIGTERM");
      settle(124);
    }, hardTimeoutMs);
  });
}

export function createOpenClawNativeLoopExecutor(
  options: OpenClawNativeLoopExecutorOptions,
): LoopExecutor {
  if (
    !isNonEmptyString(options.executable) ||
    basename(options.executable.trim()) !== "openclaw"
  ) {
    throw new TypeError(
      "OpenClaw executable must resolve to a command named openclaw.",
    );
  }
  if (!isNonEmptyString(options.configPath) || !isAbsolute(options.configPath.trim())) {
    throw new TypeError("OpenClaw native executor requires an absolute config path.");
  }
  const timeoutMs = options.timeoutMs ?? 360_000;
  const hardKillGraceMs = options.hardKillGraceMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("OpenClaw timeout must be a positive integer.");
  }
  if (!Number.isInteger(hardKillGraceMs) || hardKillGraceMs < 0) {
    throw new TypeError("OpenClaw hard-kill grace must be a non-negative integer.");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError("OpenClaw output limit must be a positive integer.");
  }

  const executable = options.executable.trim();
  const configPath = resolve(options.configPath.trim());

  return async (plan, executionCwd): Promise<LoopExecutorResult> => {
    if (plan.provider !== "openai" || plan.runtime !== "openclaw") {
      return failure(
        "execution_plan_provider_mismatch",
        "The execution plan is not assigned to the OpenClaw native OpenAI runtime.",
      );
    }

    const modelRef = openClawModelRef(plan.model);
    const expectedModel = normalizeOpenAiModel(plan.model);
    if (modelRef === null || expectedModel === null) {
      return failure(
        "execution_plan_model_mismatch",
        "The execution plan does not contain a valid OpenAI model identity.",
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
    const worktreeAdmission = admitProviderWorktree(plan, before);
    if (!worktreeAdmission.ok) {
      return failure(worktreeAdmission.code, worktreeAdmission.message, before);
    }

    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const args = [
      "agent",
      "exec",
      "--config",
      configPath,
      "--cwd",
      cwd,
      "--model",
      modelRef,
      "--thinking",
      plan.effort,
      "--timeout",
      String(timeoutSeconds),
      "--json",
      "--message-file",
      "-",
    ];
    const result = await runProcess(
      executable,
      args,
      cwd,
      buildLoopExecutionPrompt(plan),
      timeoutMs + hardKillGraceMs,
      maxOutputBytes,
    );

    const modifiedFiles = await readModifiedWorktreeFiles(cwd);
    if (modifiedFiles === null) {
      return failure(
        "worktree_status_failed",
        "Unable to inspect provider modifications.",
      );
    }
    if (result.hardTimedOut) {
      return failure(
        "provider_timeout",
        "OpenClaw native execution exceeded the outer process deadline.",
        modifiedFiles,
      );
    }
    if (result.outputLimitExceeded) {
      return failure(
        "provider_limit_exceeded",
        "OpenClaw native execution exceeded the configured output limit.",
        modifiedFiles,
      );
    }

    const envelope = parseEnvelope(result.stdout);
    if (envelope === null) {
      return failure(
        "provider_failed",
        "OpenClaw native execution returned an invalid JSON envelope.",
        modifiedFiles,
      );
    }
    if (result.exitCode === 2 || envelope.status === "timeout") {
      return failure(
        "provider_timeout",
        "OpenClaw native execution timed out.",
        modifiedFiles,
      );
    }
    if (result.exitCode !== 0 || envelope.ok !== true || envelope.status !== "ok") {
      const code = classifyStructuredFailure(envelope);
      return failure(
        code,
        code === "provider_rate_limited"
          ? "OpenClaw native OpenAI quota or rate limit was reached."
          : code === "provider_unavailable"
            ? "OpenClaw native OpenAI authentication is unavailable."
            : code === "runtime_unavailable"
              ? "OpenClaw native Codex runtime is unavailable."
              : "OpenClaw native execution failed.",
        modifiedFiles,
      );
    }
    if (
      envelope.provider !== "openai" ||
      envelope.model === null ||
      normalizeOpenAiModel(envelope.model) !== expectedModel
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "OpenClaw native execution did not use the provider/model selected by the execution plan.",
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
        `OpenClaw native Codex completed execution plan for ${plan.profileId} (${expectedModel}).`,
        ...(envelope.sessionId === undefined
          ? []
          : [`OpenClaw session: ${envelope.sessionId}.`]),
      ]),
    });
  };
}

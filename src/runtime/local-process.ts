import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  LOCAL_PROCESS_RUNTIME_ID,
  type LocalProcessExecutionPolicy,
  type RuntimeAdapter,
  type RuntimeErrorCode,
  type RuntimeEvent,
  type RuntimeEventType,
  type RuntimeExecutionError,
  type RuntimeMetadata,
  type RuntimeRequest,
  type RuntimeResult,
  type RuntimeResultStatus,
} from "./types.js";

type ValidationResult =
  | Readonly<{
      outcome: "valid";
      executable: string;
      cwd: string;
      environment: Readonly<Record<string, string>>;
      policy: LocalProcessExecutionPolicy;
    }>
  | Readonly<{ outcome: "invalid"; error: RuntimeExecutionError }>;

function error(
  code: RuntimeErrorCode,
  message: string,
  details: RuntimeMetadata = {},
  processStarted = false,
): RuntimeExecutionError {
  return { code, message, details, processStarted };
}

function now(): string {
  return new Date().toISOString();
}

function canonicalPath(path: string): string | null {
  if (!isAbsolute(path)) return null;

  try {
    return realpathSync(path);
  } catch {
    // A nonexistent executable may still be explicitly allow-listed so the
    // caller receives the stable spawn_failed result rather than a shell-like
    // fallback. Existing paths always compare by their canonical real path.
    return resolve(path);
  }
}

function canonicalExistingPath(path: string): string | null {
  if (!isAbsolute(path)) return null;

  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isWithinProject(projectRoot: string, cwd: string): boolean {
  const pathFromRoot = relative(projectRoot, cwd);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validatePolicyLimits(
  policy: LocalProcessExecutionPolicy,
): RuntimeExecutionError | null {
  const limits = [
    ["timeoutMs", policy.timeoutMs],
    ["maxStdoutBytes", policy.maxStdoutBytes],
    ["maxStderrBytes", policy.maxStderrBytes],
  ] as const;
  const invalid = limits.find(([, value]) => !isPositiveInteger(value));

  return invalid
    ? error("invalid_request", `${invalid[0]} must be a positive integer.`, {
        field: invalid[0],
      })
    : null;
}

function validateRequest(request: RuntimeRequest): ValidationResult {
  if (request.requestedRuntime !== LOCAL_PROCESS_RUNTIME_ID) {
    return {
      outcome: "invalid",
      error: error(
        "invalid_request",
        "local-process must be requested explicitly.",
      ),
    };
  }

  const localProcess = request.localProcess;
  if (!localProcess) {
    return {
      outcome: "invalid",
      error: error(
        "invalid_request",
        "local-process requires a structured command and execution policy.",
      ),
    };
  }

  const { command, executionPolicy: policy } = localProcess;
  if (!policy.enabled) {
    return {
      outcome: "invalid",
      error: error(
        "runtime_disabled",
        "Local process execution is disabled by policy.",
      ),
    };
  }

  const selection = request.resolvedAgentPolicy.selection;
  const policyAllowsShellExecution =
    request.resolvedAgentPolicy.status === "resolved" &&
    request.resolvedAgentPolicy.requirements.requiredPermissions.includes(
      "shell_exec",
    ) &&
    selection?.outcome === "selected" &&
    selection.profile.permissions.includes("shell_exec");

  if (!policyAllowsShellExecution) {
    return {
      outcome: "invalid",
      error: error(
        "permission_denied",
        "Resolved agent policy does not authorize shell_exec.",
      ),
    };
  }

  const invalidLimits = validatePolicyLimits(policy);
  if (invalidLimits) return { outcome: "invalid", error: invalidLimits };

  const projectRoot = canonicalExistingPath(policy.projectRoot);
  const cwd = canonicalExistingPath(command.cwd);
  if (!projectRoot || !cwd || !isWithinProject(projectRoot, cwd)) {
    return {
      outcome: "invalid",
      error: error(
        "working_directory_outside_project",
        "Working directory must resolve inside the canonical project root.",
      ),
    };
  }

  if (!isAbsolute(command.executable)) {
    return {
      outcome: "invalid",
      error: error("invalid_request", "Executable must be an absolute path."),
    };
  }

  const executable = canonicalPath(command.executable);
  const allowedExecutables = policy.allowedExecutables
    .map(canonicalPath)
    .filter((path): path is string => path !== null);
  if (!executable || !allowedExecutables.includes(executable)) {
    return {
      outcome: "invalid",
      error: error(
        "executable_not_allowed",
        "Executable is not present in the local process allow-list.",
      ),
    };
  }

  const environment = command.environment ?? {};
  const unauthorizedEnvironmentKey = Object.keys(environment).find(
    (key) => !policy.allowedEnvironmentKeys.includes(key),
  );
  if (unauthorizedEnvironmentKey) {
    return {
      outcome: "invalid",
      error: error(
        "environment_key_not_allowed",
        "Environment key is not allowed by local process policy.",
        { key: unauthorizedEnvironmentKey },
      ),
    };
  }

  return { outcome: "valid", executable, cwd, environment, policy };
}

function appendWithinLimit(
  chunks: Buffer[],
  chunk: Buffer,
  maxBytes: number,
): Readonly<{ exceeded: boolean; size: number }> {
  const currentSize = chunks.reduce((total, value) => total + value.length, 0);
  const remaining = Math.max(0, maxBytes - currentSize);
  if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
  return {
    exceeded: currentSize + chunk.length > maxBytes,
    size: chunk.length,
  };
}

function createResult(
  request: RuntimeRequest,
  startedAt: string,
  status: RuntimeResultStatus,
  stdout: Buffer[],
  stderr: Buffer[],
  events: readonly RuntimeEvent[],
  options: Readonly<{
    exitCode?: number | null;
    signal?: string | null;
    runtimeError?: RuntimeExecutionError;
  }> = {},
): RuntimeResult {
  const stdoutText = Buffer.concat(stdout).toString("utf8");
  const stderrText = Buffer.concat(stderr).toString("utf8");
  const runtimeError = options.runtimeError;

  return {
    runtimeId: LOCAL_PROCESS_RUNTIME_ID,
    status,
    startedAt,
    completedAt: now(),
    diagnostics: runtimeError ? [runtimeError.message] : [],
    output: { stdout: stdoutText, stderr: stderrText },
    metadata: request.metadata,
    stdout: stdoutText,
    stderr: stderrText,
    events,
    ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(runtimeError === undefined ? {} : { error: runtimeError }),
  };
}

function deniedResult(
  request: RuntimeRequest,
  startedAt: string,
  runtimeError: RuntimeExecutionError,
): RuntimeResult {
  return createResult(
    request,
    startedAt,
    "denied",
    [],
    [],
    [
      {
        type: "process_failed",
        sequence: 1,
        data: { code: runtimeError.code, processStarted: false },
      },
    ],
    { runtimeError },
  );
}

function supportsLocalProcess(request: RuntimeRequest): boolean {
  return (
    request.requestedRuntime === LOCAL_PROCESS_RUNTIME_ID &&
    (request.allowedRuntimes === undefined ||
      request.allowedRuntimes.includes(LOCAL_PROCESS_RUNTIME_ID)) &&
    (request.allowedProviders === undefined ||
      request.allowedProviders.includes("local"))
  );
}

/**
 * The only V10.1 runtime with real local execution. Validation occurs before
 * spawn; it never invokes a shell and it receives only explicitly allow-listed
 * environment variables.
 */
export const LocalProcessRuntime: RuntimeAdapter = {
  runtimeId: LOCAL_PROCESS_RUNTIME_ID,
  capabilities: ["shell_exec"],
  supports: supportsLocalProcess,
  execute(request): Promise<RuntimeResult> | RuntimeResult {
    const startedAt = now();
    const validated = validateRequest(request);
    if (validated.outcome === "invalid") {
      return deniedResult(request, startedAt, validated.error);
    }

    const { executable, cwd, environment, policy } = validated;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const events: RuntimeEvent[] = [];
    let sequence = 0;
    const event = (type: RuntimeEventType, data: RuntimeMetadata = {}) => {
      sequence += 1;
      events.push({ type, sequence, data });
    };
    event("request_validated");

    try {
      return new Promise<RuntimeResult>((complete) => {
        let processStarted = false;
        let terminalError: RuntimeExecutionError | null = null;
        let settled = false;

        const child = spawn(
          executable,
          [...request.localProcess!.command.args],
          {
            cwd,
            env: environment,
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        const finish = (
          status: RuntimeResultStatus,
          options: Readonly<{
            exitCode?: number | null;
            signal?: string | null;
            runtimeError?: RuntimeExecutionError;
          }> = {},
        ) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          complete(
            createResult(
              request,
              startedAt,
              status,
              stdout,
              stderr,
              events,
              options,
            ),
          );
        };

        const terminate = (runtimeError: RuntimeExecutionError) => {
          if (terminalError) return;
          terminalError = runtimeError;
          event("process_terminated", { code: runtimeError.code });
          child.kill("SIGTERM");
        };

        const timeout = setTimeout(() => {
          terminate(
            error("timed_out", "Local process exceeded its timeout.", {}, true),
          );
        }, policy.timeoutMs);

        child.once("spawn", () => {
          processStarted = true;
          event("process_started", { executable });
        });
        child.stdout.on("data", (value: Buffer) => {
          const chunk = Buffer.from(value);
          const result = appendWithinLimit(
            stdout,
            chunk,
            policy.maxStdoutBytes,
          );
          event("stdout_received", { bytes: result.size });
          if (result.exceeded) {
            terminate(
              error(
                "stdout_limit_exceeded",
                "Local process exceeded the stdout limit.",
                { maxBytes: policy.maxStdoutBytes },
                true,
              ),
            );
          }
        });
        child.stderr.on("data", (value: Buffer) => {
          const chunk = Buffer.from(value);
          const result = appendWithinLimit(
            stderr,
            chunk,
            policy.maxStderrBytes,
          );
          event("stderr_received", { bytes: result.size });
          if (result.exceeded) {
            terminate(
              error(
                "stderr_limit_exceeded",
                "Local process exceeded the stderr limit.",
                { maxBytes: policy.maxStderrBytes },
                true,
              ),
            );
          }
        });
        child.once("error", () => {
          const runtimeError = error(
            "spawn_failed",
            "Local process could not be started.",
            {},
            processStarted,
          );
          event("process_failed", {
            code: runtimeError.code,
            processStarted,
          });
          finish("spawn_failed", { runtimeError });
        });
        child.once("close", (exitCode, signal) => {
          event("process_completed", {
            exitCode,
            signal: signal ?? null,
          });

          if (terminalError) {
            event("process_failed", { code: terminalError.code });
            const statusByError: Readonly<
              Record<
                "timed_out" | "stdout_limit_exceeded" | "stderr_limit_exceeded",
                RuntimeResultStatus
              >
            > = {
              timed_out: "timed_out",
              stdout_limit_exceeded: "stdout_limit_exceeded",
              stderr_limit_exceeded: "stderr_limit_exceeded",
            };
            finish(
              statusByError[terminalError.code as keyof typeof statusByError],
              {
                exitCode,
                signal,
                runtimeError: terminalError,
              },
            );
            return;
          }

          if (exitCode === 0 && signal === null) {
            finish("completed", { exitCode, signal });
            return;
          }

          const runtimeError = error(
            "non_zero_exit",
            "Local process exited unsuccessfully.",
            { exitCode, signal: signal ?? null },
            processStarted,
          );
          event("process_failed", { code: runtimeError.code });
          finish("non_zero_exit", { exitCode, signal, runtimeError });
        });

        const input = request.localProcess!.command.stdin;
        if (input === undefined || input === null) {
          child.stdin.end();
        } else {
          child.stdin.end(input);
        }
      });
    } catch {
      const runtimeError = error(
        "spawn_failed",
        "Local process could not be started.",
      );
      event("process_failed", {
        code: runtimeError.code,
        processStarted: false,
      });
      return createResult(
        request,
        startedAt,
        "spawn_failed",
        stdout,
        stderr,
        events,
        { runtimeError },
      );
    }
  },
};

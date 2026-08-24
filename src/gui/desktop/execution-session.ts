import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";
import type { DesktopExecuteRequest } from "./execute-handler.js";
import {
  signalProcessGroup,
  terminateRemainingProcessGroupMembers,
} from "./process-group.js";

const MAX_PUBLIC_EVENTS = 24;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_STDERR_REMAINDER_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 5_000;
const TERMINATION_FINAL_GRACE_MS = 5_000;
const PROGRESS_PREFIX = "LOOP_EXECUTION_EVENT:";

export type DesktopExecutionEventType =
  | "session_started"
  | "preparing"
  | "execution_started"
  | "validation_started"
  | "completed"
  | "failed"
  | "cancelled";

export type DesktopExecutionEvent = Readonly<{
  sequence: number;
  type: DesktopExecutionEventType;
}>;

export type DesktopExecutionSession = Readonly<{
  id: string;
  request: DesktopExecuteRequest;
  events: readonly DesktopExecutionEvent[];
  result: CliInvocationResult | null;
}>;

export type DesktopExecutionSessionStart =
  | Readonly<{ ok: true; session: DesktopExecutionSession }>
  | Readonly<{ ok: false; kind: "spawn-error"; raw: string }>;

type ExecuteHandler = (request: unknown) => Promise<CliInvocationResult>;

function failure(raw: string): CliInvocationResult {
  return Object.freeze({ ok: false as const, kind: "spawn-error", raw });
}

function cancelledFailure(raw: string): CliInvocationResult {
  return Object.freeze({ ok: false as const, kind: "cancelled", raw });
}

function eventType(status: unknown): DesktopExecutionEventType | null {
  switch (status) {
    case "planning":
      return "preparing";
    case "executing":
      return "execution_started";
    case "validating":
      return "validation_started";
    case "completed":
      return "completed";
    case "failed":
    case "blocked":
      return "failed";
    default:
      return null;
  }
}

function isProgressEvent(value: unknown): DesktopExecutionEventType | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return eventType((value as Record<string, unknown>).status);
}

export function createObservableExecuteCliInvoker(options: {
  executable?: string;
  timeoutMs: number;
  onProgress: (type: DesktopExecutionEventType) => void;
  maxJsonBytes?: number;
  maxStderrRemainderBytes?: number;
  terminationGraceMs?: number;
  terminationFinalGraceMs?: number;
  spawnProcess?: (
    executable: string,
    args: readonly string[],
    options: {
      cwd: string;
      shell: false;
      detached: boolean;
      stdio: ["ignore", "pipe", "pipe"];
    },
  ) => ChildProcessWithoutNullStreams;
}): CliInvoker & { cancel: () => boolean } {
  const executable = options.executable ?? "node";
  const maxJsonBytes = options.maxJsonBytes ?? MAX_JSON_BYTES;
  const maxStderrRemainderBytes =
    options.maxStderrRemainderBytes ?? MAX_STDERR_REMAINDER_BYTES;
  const terminationGraceMs = options.terminationGraceMs ?? TERMINATION_GRACE_MS;
  const terminationFinalGraceMs =
    options.terminationFinalGraceMs ?? TERMINATION_FINAL_GRACE_MS;
  const spawnProcess = options.spawnProcess ?? spawn;
  if (!Number.isInteger(maxJsonBytes) || maxJsonBytes <= 0) {
    throw new Error("GUI execution JSON limit must be a positive integer.");
  }
  if (
    !Number.isInteger(maxStderrRemainderBytes) ||
    maxStderrRemainderBytes <= 0
  ) {
    throw new Error("GUI execution stderr limit must be a positive integer.");
  }
  if (!Number.isInteger(terminationGraceMs) || terminationGraceMs <= 0) {
    throw new Error(
      "GUI execution termination grace must be a positive integer.",
    );
  }
  if (!Number.isInteger(terminationFinalGraceMs) || terminationFinalGraceMs <= 0) {
    throw new Error("GUI execution final termination grace must be a positive integer.");
  }
  // The execution CLI is launched directly as a detached Node process on POSIX
  // so it owns a dedicated process group. Cancellation can then signal provider
  // descendants without relying on pnpm forwarding semantics.
  let requestActiveCancellation: (() => void) | null = null;
  return Object.freeze({
    invoke(command, args, cwd) {
      const invocationArgs = [
        "--import",
        "tsx",
        "src/cli.ts",
        command,
        ...args,
        "--progress-events",
        "--json",
      ];
      return new Promise((resolve) => {
        let settled = false;
        let stdout = "";
        let stdoutBytes = 0;
        let stderrRemainder = "";
        let stderrRemainderBytes = 0;
        let discardStderrUntilNewline = false;
        let terminationReason:
          "timeout" | "oversized-json" | "cancelled" | null = null;
        let forcedRootTermination = false;
        const finish = (result: CliInvocationResult): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearTimeout(terminationGrace);
          clearTimeout(terminationFinalGrace);
          clearTimeout(terminationRootFinalGrace);
          if (requestActiveCancellation === cancelThisInvocation) {
            requestActiveCancellation = null;
          }
          resolve(result);
        };
        const detached = process.platform !== "win32";
        const child = spawnProcess(executable, invocationArgs, {
          cwd,
          shell: false,
          detached,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const processGroupId = detached ? (child.pid ?? null) : null;
        let terminationGrace: ReturnType<typeof setTimeout> | undefined;
        let terminationFinalGrace: ReturnType<typeof setTimeout> | undefined;
        let terminationRootFinalGrace: ReturnType<typeof setTimeout> | undefined;

        const forceRootTermination = (): void => {
          if (settled) return;
          forcedRootTermination = true;
          child.kill("SIGKILL");
          terminationRootFinalGrace = setTimeout(() => {
            finish(
              failure("CLI process termination could not be confirmed."),
            );
          }, terminationFinalGraceMs);
        };

        const terminate = (
          reason: "timeout" | "oversized-json" | "cancelled",
        ): void => {
          if (terminationReason !== null || settled) return;
          terminationReason = reason;
          const groupSignalled =
            processGroupId !== null && signalProcessGroup(processGroupId, "SIGTERM");
          if (!groupSignalled) child.kill("SIGTERM");

          terminationGrace = setTimeout(() => {
            if (settled) return;
            if (processGroupId === null || child.pid === undefined) {
              forceRootTermination();
              return;
            }

            void terminateRemainingProcessGroupMembers(
              processGroupId,
              child.pid,
            ).then((descendantsTerminated) => {
              if (settled) return;
              if (!descendantsTerminated) {
                forceRootTermination();
                return;
              }
              terminationFinalGrace = setTimeout(
                forceRootTermination,
                terminationFinalGraceMs,
              );
            });
          }, terminationGraceMs);
        };
        const cancelThisInvocation = (): void => terminate("cancelled");
        requestActiveCancellation = cancelThisInvocation;
        const timeout = setTimeout(() => {
          terminate("timeout");
        }, options.timeoutMs);
        child.once("error", () => {
          if (terminationReason === null) finish(failure("CLI invocation failed."));
        });
        child.stdout.on("data", (chunk: Buffer | string) => {
          if (terminationReason !== null) return;
          const value = chunk.toString();
          const bytes = Buffer.byteLength(value, "utf8");
          if (stdoutBytes + bytes > maxJsonBytes) {
            terminate("oversized-json");
            return;
          }
          stdoutBytes += bytes;
          stdout += value;
        });
        child.stderr.on("data", (chunk: Buffer | string) => {
          let value = chunk.toString();
          if (discardStderrUntilNewline) {
            const newline = value.indexOf("\n");
            if (newline < 0) return;
            discardStderrUntilNewline = false;
            value = value.slice(newline + 1);
          }
          let offset = 0;
          while (offset <= value.length) {
            const newline = value.indexOf("\n", offset);
            const complete = newline >= 0;
            const segment = value.slice(
              offset,
              complete ? newline : value.length,
            );
            const bytes = Buffer.byteLength(segment, "utf8");
            if (stderrRemainderBytes + bytes > maxStderrRemainderBytes) {
              stderrRemainder = "";
              stderrRemainderBytes = 0;
              if (!complete) discardStderrUntilNewline = true;
            } else {
              stderrRemainder += segment;
              stderrRemainderBytes += bytes;
              if (complete) {
                if (stderrRemainder.startsWith(PROGRESS_PREFIX)) {
                  try {
                    const type = isProgressEvent(
                      JSON.parse(
                        stderrRemainder.slice(PROGRESS_PREFIX.length),
                      ) as unknown,
                    );
                    if (type !== null) options.onProgress(type);
                  } catch {
                    // Malformed auxiliary data is ignored and never exposed.
                  }
                }
                stderrRemainder = "";
                stderrRemainderBytes = 0;
              }
            }
            if (!complete) break;
            offset = newline + 1;
          }
        });
        child.once("close", async (exitCode) => {
          if (settled) return;

          if (
            terminationReason !== null &&
            processGroupId !== null &&
            child.pid !== undefined
          ) {
            const descendantsTerminated =
              await terminateRemainingProcessGroupMembers(
                processGroupId,
                child.pid,
              );
            if (!descendantsTerminated) {
              finish(
                failure("CLI descendant process termination could not be confirmed."),
              );
              return;
            }
          }

          if (forcedRootTermination) {
            finish(failure("CLI cleanup after termination could not be confirmed."));
            return;
          }
          if (terminationReason === "timeout") {
            finish(failure("CLI invocation timed out."));
            return;
          }
          if (terminationReason === "oversized-json") {
            finish(failure("CLI returned an oversized JSON result."));
            return;
          }
          if (terminationReason === "cancelled") {
            finish(cancelledFailure("CLI invocation was cancelled."));
            return;
          }
          try {
            finish(
              Object.freeze({
                ok: true as const,
                json: JSON.parse(stdout) as unknown,
                exitCode: exitCode ?? 1,
              }),
            );
          } catch {
            finish(failure("CLI returned invalid JSON."));
          }
        });
      });
    },
    cancel(): boolean {
      if (requestActiveCancellation === null) return false;
      requestActiveCancellation();
      return true;
    },
  });
}

export function createExecutionSessionManager(options: {
  createExecuteHandler: (
    onProgress: (type: DesktopExecutionEventType) => void,
  ) => Readonly<{ handler: ExecuteHandler; cancel: () => boolean }>;
  generateId?: () => string;
  maxEvents?: number;
}) {
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const maxEvents = options.maxEvents ?? MAX_PUBLIC_EVENTS;
  let active: {
    session: DesktopExecutionSession;
    completion: Promise<void>;
    cancel: () => boolean;
  } | null = null;

  function append(type: DesktopExecutionEventType): void {
    if (!active || active.session.result !== null) return;
    const event: DesktopExecutionEvent = Object.freeze({
      sequence: (active.session.events.at(-1)?.sequence ?? 0) + 1,
      type,
    });
    const events = Object.freeze(
      [...active.session.events, event].slice(-maxEvents),
    );
    active.session = Object.freeze({ ...active.session, events });
  }

  return Object.freeze({
    async start(request: unknown): Promise<DesktopExecutionSessionStart> {
      if (active?.session.result === null)
        return Object.freeze({
          ok: false as const,
          kind: "spawn-error" as const,
          raw: "An execution session is already active.",
        });
      if (maxEvents <= 0 || !Number.isInteger(maxEvents)) {
        throw new Error(
          "GUI execution event limit must be a positive integer.",
        );
      }
      const session = Object.freeze({
        id: generateId(),
        request: request as DesktopExecuteRequest,
        events: Object.freeze([
          { sequence: 1, type: "session_started" as const },
        ]),
        result: null,
      });
      const { handler, cancel } = options.createExecuteHandler(append);
      active = { session, completion: Promise.resolve(), cancel };
      const completion = handler(request)
        .then((result) => {
          if (!active) return;
          if (!result.ok)
            append(result.kind === "cancelled" ? "cancelled" : "failed");
          active.session = Object.freeze({ ...active.session, result });
        })
        .catch(() => {
          if (!active) return;
          append("failed");
          active.session = Object.freeze({
            ...active.session,
            result: failure("Execution session failed."),
          });
        });
      active.completion = completion;
      return Object.freeze({ ok: true as const, session: active.session });
    },
    get(id: unknown): DesktopExecutionSession | null {
      return typeof id === "string" && active?.session.id === id
        ? active.session
        : null;
    },
    async waitForCompletion(id: string): Promise<void> {
      if (active?.session.id === id) await active.completion;
    },
    cancel(id: unknown): boolean {
      if (
        typeof id !== "string" ||
        !active ||
        active.session.id !== id ||
        active.session.result !== null
      )
        return false;
      return active.cancel();
    },
  });
}

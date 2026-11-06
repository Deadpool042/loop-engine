/**
 * Bounded termination of a POSIX process group (L7).
 *
 * An `AbortSignal` cannot stop a child process by itself, and `child.kill()`
 * reaches only the direct child: a grandchild that ignores `SIGTERM` or keeps
 * the stdio pipes open survives and could keep writing. The provider processes
 * are therefore spawned in their own process group (`detached`) and the whole
 * group is signalled, escalated to `SIGKILL` after a bounded grace period, and
 * only reported as terminated once the group is observed gone.
 *
 * Limits: POSIX only (no process groups on Windows); `kill(-pgid, 0)` cannot
 * distinguish a zombie from a live member until it is reaped; a process that
 * changes its own process group (`setsid`) escapes the group.
 */

export type ProcessTerminationOutcome = "terminated" | "cleanup_failed";

export type ProcessTerminationDependencies = Readonly<{
  /** Delay between `SIGTERM` and the `SIGKILL` escalation. */
  killGraceMs: number;
  /** Bounded wait for the group to disappear after `SIGKILL`. */
  confirmMs: number;
  /** Returns false when the group is already gone or cannot be signalled. */
  signalGroup?: (processGroupId: number, signal: NodeJS.Signals) => boolean;
  isGroupAlive?: (processGroupId: number) => boolean;
  sleep?: (durationMs: number) => Promise<void>;
}>;

export const DEFAULT_PROCESS_KILL_GRACE_MS = 2_000;
export const DEFAULT_PROCESS_CONFIRM_MS = 2_000;
const POLL_INTERVAL_MS = 20;

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

function defaultSignalGroup(
  processGroupId: number,
  signal: NodeJS.Signals,
): boolean {
  try {
    process.kill(-processGroupId, signal);
    return true;
  } catch (error) {
    // ESRCH: nothing left to signal. Any other error (EPERM) is a real failure.
    return errorCode(error) === "ESRCH";
  }
}

function defaultIsGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function validGroupId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 1;
}

/**
 * Terminates a process group and reports whether it was proven gone. A group
 * that survives `SIGKILL` within `confirmMs` yields `cleanup_failed`; callers
 * must surface it instead of reporting a clean cancellation.
 */
export async function terminateProcessGroup(
  processGroupId: number,
  dependencies: ProcessTerminationDependencies,
): Promise<ProcessTerminationOutcome> {
  if (process.platform === "win32" || !validGroupId(processGroupId)) {
    return "cleanup_failed";
  }
  const signalGroup = dependencies.signalGroup ?? defaultSignalGroup;
  const isGroupAlive = dependencies.isGroupAlive ?? defaultIsGroupAlive;
  const sleep = dependencies.sleep ?? defaultSleep;

  const waitUntilGone = async (budgetMs: number): Promise<boolean> => {
    const deadline = Date.now() + budgetMs;
    while (isGroupAlive(processGroupId)) {
      if (Date.now() >= deadline) return false;
      await sleep(POLL_INTERVAL_MS);
    }
    return true;
  };

  signalGroup(processGroupId, "SIGTERM");
  if (await waitUntilGone(dependencies.killGraceMs)) return "terminated";

  signalGroup(processGroupId, "SIGKILL");
  return (await waitUntilGone(dependencies.confirmMs))
    ? "terminated"
    : "cleanup_failed";
}

/**
 * A cancellable child runs in its own process group so that its descendants can
 * be terminated with it. Without a signal nothing changes: the child stays in
 * the caller's group and keeps receiving terminal signals such as Ctrl-C.
 */
export function usesOwnProcessGroup(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && process.platform !== "win32";
}

export type ChildCancellationWatch = Readonly<{
  /** True from the moment the abort was observed until `dispose()`. */
  isCancelling(): boolean;
  dispose(): void;
}>;

/**
 * Terminates `child` (and its process group when it owns one) when `signal`
 * aborts, then reports whether termination was proven. `onTerminated` is called
 * at most once and only after the group is observed gone (or the bounded wait
 * expired), never merely after `SIGTERM` was sent and never on stdio `close`:
 * a descendant holding the pipes open would block `close` indefinitely.
 */
export function watchChildForCancellation(
  child: Readonly<{
    pid?: number | undefined;
    kill(signal?: NodeJS.Signals): boolean;
  }>,
  signal: AbortSignal | undefined,
  ownGroup: boolean,
  onTerminated: (outcome: ProcessTerminationOutcome) => void,
  dependencies: Partial<ProcessTerminationDependencies> = {},
): ChildCancellationWatch {
  let cancelling = false;
  let disposed = false;
  const onAbort = (): void => {
    if (cancelling || disposed) return;
    cancelling = true;
    const groupId = child.pid;
    if (!ownGroup || groupId === undefined) {
      child.kill("SIGKILL");
      // Never synchronous: callers declare their `settle` after the watch.
      queueMicrotask(() => onTerminated("terminated"));
      return;
    }
    void terminateProcessGroup(groupId, {
      killGraceMs: DEFAULT_PROCESS_KILL_GRACE_MS,
      confirmMs: DEFAULT_PROCESS_CONFIRM_MS,
      ...dependencies,
    }).then(onTerminated);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted === true) onAbort();
  return Object.freeze({
    isCancelling: () => cancelling,
    dispose: () => {
      disposed = true;
      signal?.removeEventListener("abort", onAbort);
    },
  });
}

/**
 * Cooperative cancellation vocabulary shared by the runner, the executors and
 * the durable controller (L7).
 *
 * An `AbortSignal` is only a request: it never proves that an executor stopped
 * or that external effects were rolled back. Reasons are a closed vocabulary so
 * that no raw abort reason (which may carry paths, tokens or provider output)
 * can reach a public result.
 */

export const LOOP_CANCELLATION_REASONS = Object.freeze([
  "cancellation_requested",
  "lease_lost",
  "caller_aborted",
] as const);

export type LoopCancellationReason = (typeof LOOP_CANCELLATION_REASONS)[number];

/** Stable failure code of a run that observed a cancellation. */
export const EXECUTION_CANCELLED_CODE = "execution_cancelled";

/**
 * Stable failure code when a provider process could not be proven terminated
 * after a cancellation. Never masked behind `execution_cancelled`.
 */
export const CANCELLATION_CLEANUP_FAILED_CODE = "cancellation_cleanup_failed";

/** Optional execution context handed to a `LoopExecutor` as its third argument. */
export type LoopExecutorContext = Readonly<{
  signal?: AbortSignal;
}>;

/** Carries a typed cancellation reason as `AbortSignal.reason`. */
export class LoopCancellationReasonError extends Error {
  readonly cancellationReason: LoopCancellationReason;

  constructor(cancellationReason: LoopCancellationReason) {
    super(`Loop cancellation: ${cancellationReason}`);
    this.name = "LoopCancellationReasonError";
    this.cancellationReason = cancellationReason;
  }
}

/**
 * Aborts with a typed reason. `AbortController.abort` is idempotent: when the
 * signal is already aborted the first reason is kept, so repeated requests
 * cannot rewrite the recorded cause.
 */
export function abortWithReason(
  controller: AbortController,
  reason: LoopCancellationReason,
): void {
  controller.abort(new LoopCancellationReasonError(reason));
}

/**
 * Maps whatever reason an `AbortSignal` carries to the closed vocabulary. An
 * untyped reason (`controller.abort()`, `controller.abort(new Error(...))`,
 * a timeout) is reported as `caller_aborted` and its content is discarded.
 */
export function cancellationReasonOf(
  signal: AbortSignal,
): LoopCancellationReason {
  const reason: unknown = signal.reason;
  if (
    reason instanceof LoopCancellationReasonError &&
    LOOP_CANCELLATION_REASONS.includes(reason.cancellationReason)
  ) {
    return reason.cancellationReason;
  }
  return "caller_aborted";
}

/**
 * Returns a signal that aborts when any input aborts, keeping the reason of the
 * first one. Undefined inputs are ignored; `undefined` is returned when nothing
 * is left to observe.
 */
export function combineAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
): AbortSignal | undefined {
  const defined = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return AbortSignal.any(defined);
}

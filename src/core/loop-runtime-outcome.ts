import type { PolicyBoundLocalProcessExecutionResult } from "./runtime-execution-bridge.js";
import type { RuntimeResult } from "../runtime/types.js";

export type LoopRuntimeExecutionOutcomeStatus =
  | "not_started"
  | "succeeded"
  | "timed_out"
  | "failed";

export type LoopRuntimeExecutionOutcome = Readonly<{
  outcome: LoopRuntimeExecutionOutcomeStatus;
  runtimeStatus: RuntimeResult["status"] | null;
}>;

export type LoopRuntimeFailureKind =
  | "policy_denied"
  | "unsupported"
  | "launch_failed"
  | "process_failed"
  | "timed_out"
  | "output_limit";

export type LoopRuntimeFailure = Readonly<{
  kind: LoopRuntimeFailureKind | null;
  runtimeStatus: RuntimeResult["status"] | null;
}>;

const LOOP_RUNTIME_FAILURE_KIND_BY_STATUS: Readonly<
  Record<RuntimeResult["status"], LoopRuntimeFailureKind | null>
> = Object.freeze({
  not_implemented: "unsupported",
  unsupported: "unsupported",
  completed: null,
  denied: "policy_denied",
  spawn_failed: "launch_failed",
  non_zero_exit: "process_failed",
  timed_out: "timed_out",
  stdout_limit_exceeded: "output_limit",
  stderr_limit_exceeded: "output_limit",
});

function runtimeStatus(
  runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult | null | undefined,
): RuntimeResult["status"] | null {
  return runtimeExecutionResult?.runtimeResult?.status ?? null;
}

export function classifyLoopRuntimeExecutionOutcome(
  runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult | null | undefined,
): LoopRuntimeExecutionOutcome {
  const status = runtimeStatus(runtimeExecutionResult);

  if (status === null) {
    return Object.freeze({
      outcome: "not_started",
      runtimeStatus: null,
    });
  }

  if (status === "completed") {
    return Object.freeze({
      outcome: "succeeded",
      runtimeStatus: status,
    });
  }

  if (status === "timed_out") {
    return Object.freeze({
      outcome: "timed_out",
      runtimeStatus: status,
    });
  }

  return Object.freeze({
    outcome: "failed",
    runtimeStatus: status,
  });
}

export function classifyLoopRuntimeFailure(
  outcome: LoopRuntimeExecutionOutcome,
): LoopRuntimeFailure {
  if (outcome.outcome === "not_started" || outcome.outcome === "succeeded") {
    return Object.freeze({
      kind: null,
      runtimeStatus: outcome.runtimeStatus,
    });
  }

  if (outcome.runtimeStatus === null) {
    return Object.freeze({
      kind: null,
      runtimeStatus: null,
    });
  }

  return Object.freeze({
    kind: LOOP_RUNTIME_FAILURE_KIND_BY_STATUS[outcome.runtimeStatus],
    runtimeStatus: outcome.runtimeStatus,
  });
}

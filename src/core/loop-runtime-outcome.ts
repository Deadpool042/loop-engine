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

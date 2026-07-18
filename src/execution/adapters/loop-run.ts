import type { LoopRunResult, LoopRunStatus } from "../../loop/types.js";
import type {
  ExecutionFailure,
  ExecutionResult,
  ExecutionStatus,
  ExecutionStepResult,
} from "../types.js";

function toExecutionStatus(
  status: LoopRunStatus,
): ExecutionStatus {
  switch (status) {
    case "completed":
      return "completed";

    case "failed":
    case "blocked":
    case "cancelled":
      return "failed";

    case "idle":
    case "planning":
    case "ready":
      return "prepared";

    case "executing":
    case "validating":
    case "repairing":
      return "running";
  }
}

function toExecutionStep(step: LoopRunResult["steps"][number]): ExecutionStepResult {
  return {
    name: step.name,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    success: step.status === "completed",
    details: [...step.details],
  };
}

function toExecutionFailure(
  failure: LoopRunResult["failure"],
): ExecutionFailure | null {
  if (!failure) {
    return null;
  }

  return {
    code: failure.code,
    message: failure.message,
    details: [...failure.details],
  };
}

export function executionResultFromLoopRun(
  result: LoopRunResult,
): ExecutionResult {
  return {
    schemaVersion: 1,
    sessionId: result.runId,
    status: toExecutionStatus(result.status),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    steps: result.steps.map(toExecutionStep),
    failure: toExecutionFailure(result.failure),
  };
}

import type { ExecutionResult } from "./types.js";

export interface ExecutionSummary {
  readonly sessionId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly stepCount: number;
  readonly succeeded: number;
  readonly failed: number;
}

export function createExecutionSummary(
  result: ExecutionResult,
): ExecutionSummary {
  const succeeded = result.steps.filter((step) => step.success).length;

  return Object.freeze({
    sessionId: result.sessionId,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    stepCount: result.steps.length,
    succeeded,
    failed: result.steps.length - succeeded,
  });
}

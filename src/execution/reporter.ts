import { createExecutionSummary } from "./summary.js";
import type { ExecutionResult } from "./types.js";

export function renderExecutionText(
  result: ExecutionResult,
): string {
  const summary = createExecutionSummary(result);

  return [
    `Execution ${summary.sessionId}`,
    `Status: ${summary.status}`,
    `Started: ${summary.startedAt}`,
    `Completed: ${summary.completedAt ?? "-"}`,
    `Steps: ${summary.stepCount}`,
    `Succeeded: ${summary.succeeded}`,
    `Failed: ${summary.failed}`,
  ].join("\n");
}

import { createExecutionSummary } from "./summary.js";
import type {
  ExecutionResult,
  ExecutionStepResult,
} from "./types.js";

function renderExecutionStep(
  step: ExecutionStepResult,
): readonly string[] {
  return [
    `- ${step.name}`,
    `  Status: ${step.success ? "success" : "failed"}`,
    `  Started: ${step.startedAt}`,
    `  Completed: ${step.completedAt}`,
    `  Details: ${step.details.length}`,
  ];
}

export function renderExecutionText(
  result: ExecutionResult,
): string {
  const summary = createExecutionSummary(result);

  const lines = [
    `Execution ${summary.sessionId}`,
    `Status: ${summary.status}`,
    `Started: ${summary.startedAt}`,
    `Completed: ${summary.completedAt ?? "-"}`,
    `Steps: ${summary.stepCount}`,
    `Succeeded: ${summary.succeeded}`,
    `Failed: ${summary.failed}`,
  ];

  if (result.steps.length > 0) {
    lines.push("", "Step details:");

    for (const step of result.steps) {
      lines.push(...renderExecutionStep(step));
    }
  }

  return lines.join("\n");
}

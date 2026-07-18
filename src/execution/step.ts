import type { ExecutionStep, ExecutionStepResult } from "./types.js";
import type { ExecutionClock } from "./clock.js";

export function executeStep(
  step: ExecutionStep,
  clock: ExecutionClock,
): ExecutionStepResult {
  const startedAt = clock.now();
  const details = step.run();
  const completedAt = clock.now();

  return {
    name: step.name,
    startedAt,
    completedAt,
    success: true,
    details,
  };
}

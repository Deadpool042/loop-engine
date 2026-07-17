import type { ExecutionPlan } from "../executor/types.js";
import type { ExecutionStep } from "./types.js";

export function executionStepsFromPlan(
  plan: ExecutionPlan,
): readonly ExecutionStep[] {
  return plan.steps.map((step) => ({
    name: step.name,
    run: () => step.details,
  }));
}
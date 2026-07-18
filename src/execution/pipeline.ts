import type { ExecutionPlan } from "../executor/types.js";

import { execute } from "./engine.js";
import { executionStepsFromPlan } from "./from-plan.js";

export function executePlan(plan: ExecutionPlan, now: () => string) {
  return execute(executionStepsFromPlan(plan), {
    sessionId: plan.session.sessionId,
    now,
  });
}

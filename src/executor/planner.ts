import { createExecutionSession } from "./session.js";
import { transitionExecutionSession } from "./state-machine.js";
import type { ExecutionPlan } from "./types.js";

export interface CreateExecutionPlanOptions {
  readonly sessionId: string;
  readonly createdAt: string;
}

export function createExecutionPlan(
  options: CreateExecutionPlanOptions,
): ExecutionPlan {
  const session = transitionExecutionSession(
    createExecutionSession({
      sessionId: options.sessionId,
      createdAt: options.createdAt,
    }),
    "prepared",
  );

  return Object.freeze({
    session,
    steps: Object.freeze([]),
  });
}

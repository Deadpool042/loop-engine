import { createExecutionSession } from "./session.js";
import { transitionExecutionSession } from "./state-machine.js";
import type { ExecutionSession } from "./types.js";

export interface CreateExecutionPlanOptions {
  readonly sessionId: string;
  readonly createdAt: string;
}

export function createExecutionPlan(
  options: CreateExecutionPlanOptions,
): ExecutionSession {
  const session = createExecutionSession({
    sessionId: options.sessionId,
    createdAt: options.createdAt,
  });

  return transitionExecutionSession(session, "prepared");
}

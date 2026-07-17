import { createExecutionClock } from "./clock.js";
import { executeStep } from "./step.js";
import {
  completeExecution,
  createExecutionSession,
  failExecution,
  startExecution,
} from "./session.js";
import type {
  ExecutionFailure,
  ExecutionResult,
  ExecutionStep,
  ExecutionStepResult,
} from "./types.js";

export type ExecuteOptions = Readonly<{
  sessionId: string;
  now: () => string;
}>;

export function execute(
  steps: readonly ExecutionStep[],
  options: ExecuteOptions,
): ExecutionResult {
  const clock = createExecutionClock(options.now);
  const startedAt = clock.now();

  let session = createExecutionSession(options.sessionId, startedAt);
  session = startExecution(session);

  const results: ExecutionStepResult[] = [];

  try {
    for (const step of steps) {
      results.push(executeStep(step, clock));
    }

    session = completeExecution(session);

    return {
      schemaVersion: 1,
      sessionId: session.sessionId,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: clock.now(),
      steps: results,
      failure: null,
    };
  } catch (error) {
    session = failExecution(session);

    const failure: ExecutionFailure = {
      code: "execution_failed",
      message: error instanceof Error ? error.message : String(error),
      details: [],
    };

    return {
      schemaVersion: 1,
      sessionId: session.sessionId,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: clock.now(),
      steps: results,
      failure,
    };
  }
}
import {
  completeExecution,
  createExecutionSession,
  failExecution,
  startExecution,
} from "./session.js";
import type {
  ExecutionFailure,
  ExecutionResult,
  ExecutionStepResult,
} from "./types.js";

export type ExecutionStep = Readonly<{
  name: string;
  run: () => readonly string[];
}>;

export type ExecuteOptions = Readonly<{
  sessionId: string;
  now: () => string;
}>;

export function execute(
  steps: readonly ExecutionStep[],
  options: ExecuteOptions,
): ExecutionResult {
  const startedAt = options.now();

  let session = createExecutionSession(options.sessionId, startedAt);
  session = startExecution(session);

  const results: ExecutionStepResult[] = [];

  try {
    for (const step of steps) {
      const stepStartedAt = options.now();
      const details = step.run();
      const stepCompletedAt = options.now();

      results.push({
        name: step.name,
        startedAt: stepStartedAt,
        completedAt: stepCompletedAt,
        success: true,
        details,
      });
    }

    session = completeExecution(session);

    return {
      schemaVersion: 1,
      sessionId: session.sessionId,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: options.now(),
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
      completedAt: options.now(),
      steps: results,
      failure,
    };
  }
}
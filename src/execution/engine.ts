import { createExecutionClock } from "./clock.js";
import { executeStep } from "./step.js";
import {
  createExecutionEventRecorder,
  emitExecutionEvent,
} from "./events.js";
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
  const recorder = createExecutionEventRecorder();
  const startedAt = clock.now();

  let session = createExecutionSession(options.sessionId, startedAt);
  session = startExecution(session);

  emitExecutionEvent(recorder, {
    type: "execution.started",
    sessionId: session.sessionId,
    at: session.startedAt,
  });

  const results: ExecutionStepResult[] = [];

  try {
    for (const step of steps) {
      emitExecutionEvent(recorder, {
        type: "step.started",
        name: step.name,
        at: clock.now(),
      });

      const result = executeStep(step, clock);
      results.push(result);

      emitExecutionEvent(recorder, {
        type: "step.completed",
        name: result.name,
        at: result.completedAt,
      });
    }

    session = completeExecution(session);

    emitExecutionEvent(recorder, {
      type: "execution.completed",
      sessionId: session.sessionId,
      at: clock.now(),
    });

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

    emitExecutionEvent(recorder, {
      type: "execution.failed",
      sessionId: session.sessionId,
      at: clock.now(),
    });

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
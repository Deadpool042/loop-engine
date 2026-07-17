import type {
  ExecutionMode,
  ExecutionSession,
  ExecutionState,
} from "./types.js";

export interface CreateExecutionSessionOptions {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly executionMode?: ExecutionMode;
  readonly executionState?: ExecutionState;
}

export function createExecutionSession(
  options: CreateExecutionSessionOptions,
): ExecutionSession {
  return Object.freeze({
    sessionId: options.sessionId,
    createdAt: options.createdAt,
    executionMode: options.executionMode ?? "plan",
    executionState: options.executionState ?? "created",
  });
}

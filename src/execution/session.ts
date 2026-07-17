import type { ExecutionResult, ExecutionStatus } from "./types.js";

export type ExecutionSession = Readonly<{
  sessionId: string;
  status: ExecutionStatus;
  startedAt: string;
}>;

export function createExecutionSession(
  sessionId: string,
  startedAt: string,
): ExecutionSession {
  return {
    sessionId,
    status: "prepared",
    startedAt,
  };
}

export function startExecution(
  session: ExecutionSession,
): ExecutionSession {
  return {
    ...session,
    status: "running",
  };
}

export function completeExecution(
  session: ExecutionSession,
): ExecutionSession {
  return {
    ...session,
    status: "completed",
  };
}

export function failExecution(
  session: ExecutionSession,
): ExecutionSession {
  return {
    ...session,
    status: "failed",
  };
}
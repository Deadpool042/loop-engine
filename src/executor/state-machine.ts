import type { ExecutionSession, ExecutionState } from "./types.js";

const transitions: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = {
  created: ["prepared"],
  prepared: [],
};

export function isExecutionTransitionAllowed(
  from: ExecutionState,
  to: ExecutionState,
): boolean {
  return transitions[from].includes(to);
}

export function transitionExecutionSession(
  session: ExecutionSession,
  to: ExecutionState,
): ExecutionSession {
  if (!isExecutionTransitionAllowed(session.executionState, to)) {
    throw new Error(
      `Invalid execution transition: ${session.executionState} -> ${to}`,
    );
  }

  return Object.freeze({
    ...session,
    executionState: to,
  });
}

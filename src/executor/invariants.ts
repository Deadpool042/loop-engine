import { isExecutionTransitionAllowed } from "./state-machine.js";
import type { ExecutionSession, ExecutionState } from "./types.js";

export function assertExecutionState(
  session: ExecutionSession,
  expected: ExecutionState,
): void {
  if (session.executionState !== expected) {
    throw new Error(
      `Expected execution state "${expected}" but got "${session.executionState}".`,
    );
  }
}

export function assertExecutionTransition(
  from: ExecutionState,
  to: ExecutionState,
): void {
  if (!isExecutionTransitionAllowed(from, to)) {
    throw new Error(`Illegal execution transition: ${from} -> ${to}.`);
  }
}

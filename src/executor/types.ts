/**
 * V8.0
 *
 * Public contracts for the Loop Executor.
 *
 * This module is intentionally provider-agnostic.
 * It contains no execution logic.
 */

export type ExecutionState =
  | "created"
  | "prepared";

export type ExecutionMode = "plan";

export interface ExecutionSession {
  readonly sessionId: string;
  readonly createdAt: string;

  readonly executionMode: ExecutionMode;
  readonly executionState: ExecutionState;
}

export type ExecutionEvent =
  | Readonly<{
      type: "execution.started";
      sessionId: string;
      at: string;
    }>
  | Readonly<{
      type: "step.started";
      name: string;
      at: string;
    }>
  | Readonly<{
      type: "step.completed";
      name: string;
      at: string;
    }>
  | Readonly<{
      type: "execution.completed";
      sessionId: string;
      at: string;
    }>
  | Readonly<{
      type: "execution.failed";
      sessionId: string;
      at: string;
    }>;

export interface ExecutionEventRecorder {
  record(event: ExecutionEvent): void;
}

export function createExecutionEventRecorder(): ExecutionEventRecorder {
  return Object.freeze({
    record() {
      // no-op
    },
  });
}

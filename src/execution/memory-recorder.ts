import type { ExecutionEvent, ExecutionEventRecorder } from "./events.js";

export interface MemoryExecutionEventRecorder extends ExecutionEventRecorder {
  readonly events: readonly ExecutionEvent[];
}

export function createMemoryExecutionEventRecorder(): MemoryExecutionEventRecorder {
  const events: ExecutionEvent[] = [];

  return Object.freeze({
    record(event: ExecutionEvent) {
      events.push(event);
    },

    get events() {
      return events;
    },
  });
}

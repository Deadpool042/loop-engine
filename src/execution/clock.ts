export interface ExecutionClock {
  now(): string;
}

export function createExecutionClock(now: () => string): ExecutionClock {
  return Object.freeze({
    now,
  });
}

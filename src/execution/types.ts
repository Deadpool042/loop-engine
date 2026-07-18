export type ExecutionStatus = "prepared" | "running" | "completed" | "failed";

export type ExecutionStep = Readonly<{
  name: string;
  run: () => readonly string[];
}>;

export type ExecutionStepResult = Readonly<{
  name: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  details: readonly string[];
}>;

export type ExecutionFailure = Readonly<{
  code: string;
  message: string;
  details: readonly string[];
}>;

export type ExecutionResult = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  steps: readonly ExecutionStepResult[];
  failure: ExecutionFailure | null;
}>;

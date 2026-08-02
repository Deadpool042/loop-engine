export type AutomationOrchestratorWorkerExecutionLifecycleProgressionStatus =
  | "execution_running"
  | "execution_completed"
  | "execution_failed"
  | "execution_indeterminate"
  | "progression_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleProgressionReason =
  | "observation_running"
  | "observation_completed"
  | "observation_failed"
  | "observation_indeterminate"
  | "invalid_lifecycle"
  | "invalid_observation_validation"
  | "identifier_mismatch";

export type AutomationOrchestratorWorkerExecutionLifecycleProgressionResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleProgressionStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleProgressionReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    executionSucceeded: boolean;
  }>;

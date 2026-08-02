export type AutomationOrchestratorWorkerExecutionLifecycleObservationStatus =
  "running" | "completed" | "failed" | "indeterminate";
export type AutomationOrchestratorWorkerExecutionLifecycleObservationReason =
  | "execution_running"
  | "execution_completed"
  | "execution_failed"
  | "execution_indeterminate";
export type AutomationOrchestratorWorkerExecutionLifecycleObservation =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleObservationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleObservationReason;
    requestId: string;
    delegationId: string;
    candidateId: string;
    targetId: string;
    executionStarted: boolean;
    executionFinished: boolean;
    executionSucceeded: boolean;
  }>;
export type AutomationOrchestratorWorkerExecutionLifecycleObservationValidationStatus =
  "observation_accepted" | "observation_rejected" | "observation_indeterminate";
export type AutomationOrchestratorWorkerExecutionLifecycleObservationValidationReason =
  | AutomationOrchestratorWorkerExecutionLifecycleObservationReason
  | "invalid_lifecycle"
  | "invalid_observation"
  | "identifier_mismatch";
export type AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleObservationValidationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleObservationValidationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    executionSucceeded: boolean;
  }>;

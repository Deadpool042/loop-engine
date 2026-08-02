export type AutomationOrchestratorWorkerExecutionLifecycleFinalizationStatus =
  | "lifecycle_finalized"
  | "lifecycle_active"
  | "lifecycle_indeterminate"
  | "finalization_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleFinalizationReason =
  | "execution_completed"
  | "execution_failed"
  | "execution_running"
  | "execution_indeterminate"
  | "invalid_progression";

export type AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleFinalizationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleFinalizationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    executionSucceeded: boolean;
    lifecycleFinalized: boolean;
  }>;

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationStatus =
  | "closure_ready"
  | "closure_not_required"
  | "closure_indeterminate"
  | "closure_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationReason =
  | "completed_lifecycle"
  | "failed_lifecycle"
  | "active_lifecycle"
  | "indeterminate_lifecycle"
  | "invalid_finalization";

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    executionSucceeded: boolean;
    lifecycleFinalized: boolean;
    closureRequired: boolean;
  }>;

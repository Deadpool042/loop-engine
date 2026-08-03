export type AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionStatus =
  | "lifecycle_closed"
  | "lifecycle_not_closed"
  | "lifecycle_indeterminate"
  | "transition_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionReason =
  | "closure_confirmed"
  | "closure_rejected"
  | "closure_indeterminate"
  | "invalid_receipt";

export type AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    lifecycleFinalized: boolean;
    lifecycleClosed: boolean;
  }>;

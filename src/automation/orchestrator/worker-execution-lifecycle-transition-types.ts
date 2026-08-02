export type AutomationOrchestratorWorkerExecutionLifecycleTransitionStatus =
  | "execution_started"
  | "execution_not_started"
  | "execution_indeterminate"
  | "transition_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleTransitionReason =
  | "receipt_confirmed"
  | "receipt_not_started"
  | "receipt_indeterminate"
  | "invalid_receipt_validation"
  | "invalid_lifecycle"
  | "identifier_mismatch";

export type AutomationOrchestratorWorkerExecutionLifecycleTransitionResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleTransitionStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleTransitionReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
  }>;

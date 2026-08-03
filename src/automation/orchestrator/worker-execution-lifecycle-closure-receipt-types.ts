export type AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptStatus =
  | "closure_confirmed"
  | "closure_rejected"
  | "closure_indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptReason =
  | "closure_accepted"
  | "closure_rejected"
  | "closure_indeterminate"
  | "invalid_invocation";

export type AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    closureAttempted: boolean;
    closureRequested: boolean;
    lifecycleClosed: boolean;
  }>;

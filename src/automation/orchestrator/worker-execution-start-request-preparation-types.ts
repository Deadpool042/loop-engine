export type AutomationOrchestratorWorkerExecutionStartPreparationStatus =
  "request_prepared" | "request_rejected" | "request_indeterminate";
export type AutomationOrchestratorWorkerExecutionStartPreparationReason =
  | "execution_pending"
  | "execution_not_started"
  | "execution_indeterminate"
  | "invalid_lifecycle_initialization";
export type AutomationOrchestratorWorkerExecutionStartRequest = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
  executionStarted: false;
}>;
export type AutomationOrchestratorWorkerExecutionStartPreparationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionStartPreparationStatus;
    reason: AutomationOrchestratorWorkerExecutionStartPreparationReason;
    request: AutomationOrchestratorWorkerExecutionStartRequest | null;
    executionStarted: false;
  }>;

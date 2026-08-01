export type AutomationOrchestratorWorkerExecutionStartReceiptStatus =
  "started" | "not_started" | "indeterminate";

export type AutomationOrchestratorWorkerExecutionStartReceiptReason =
  "execution_started" | "execution_not_started" | "execution_indeterminate";

export type AutomationOrchestratorWorkerExecutionStartReceipt = Readonly<{
  status: AutomationOrchestratorWorkerExecutionStartReceiptStatus;
  reason: AutomationOrchestratorWorkerExecutionStartReceiptReason;
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
  executionStarted: boolean;
}>;

export type AutomationOrchestratorWorkerExecutionStartReceiptValidationStatus =
  "receipt_accepted" | "receipt_rejected" | "receipt_indeterminate";

export type AutomationOrchestratorWorkerExecutionStartReceiptValidationReason =
  | "execution_started"
  | "execution_not_started"
  | "execution_indeterminate"
  | "invalid_service_result"
  | "invalid_receipt"
  | "identifier_mismatch";

export type AutomationOrchestratorWorkerExecutionStartReceiptValidationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionStartReceiptValidationStatus;
    reason: AutomationOrchestratorWorkerExecutionStartReceiptValidationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
  }>;

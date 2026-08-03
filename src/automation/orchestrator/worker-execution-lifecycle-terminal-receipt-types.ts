export type AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptStatus =
  | "terminal_confirmed"
  | "terminal_rejected"
  | "terminal_indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptReason =
  | "terminal_state_confirmed"
  | "terminal_state_rejected"
  | "terminal_state_indeterminate"
  | "invalid_terminal_state";

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    lifecycleFinalized: boolean;
    lifecycleClosed: boolean;
    terminal: boolean;
    terminalConfirmed: boolean;
  }>;

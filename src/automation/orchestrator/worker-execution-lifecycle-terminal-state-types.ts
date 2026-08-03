export type AutomationOrchestratorWorkerExecutionLifecycleTerminalStateStatus =
  | "lifecycle_terminal"
  | "lifecycle_non_terminal"
  | "lifecycle_indeterminate"
  | "terminal_state_rejected";

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalStateReason =
  | "closure_confirmed"
  | "closure_rejected"
  | "closure_indeterminate"
  | "invalid_transition";

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    executionStarted: boolean;
    executionFinished: boolean;
    lifecycleFinalized: boolean;
    lifecycleClosed: boolean;
    terminal: boolean;
  }>;

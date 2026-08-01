export type AutomationOrchestratorWorkerExecutionLifecycleInitializationStatus =
  "execution_pending" | "execution_not_started" | "execution_indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleInitializationReason =
  | "dispatch_accepted"
  | "dispatch_rejected"
  | "dispatch_indeterminate"
  | "command_rejected"
  | "invalid_command"
  | "invalid_port_result"
  | "port_failed"
  | "invalid_dispatch_service_result";

export type AutomationOrchestratorWorkerExecutionLifecycleInitializationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleInitializationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleInitializationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    dispatchOccurred: false;
    workerSelected: false;
    providerInvoked: false;
    forgeInvoked: false;
    executionStarted: false;
  }>;

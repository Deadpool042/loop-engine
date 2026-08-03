export type AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationStatus =
  | "closure_accepted"
  | "closure_rejected"
  | "closure_indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationReason =
  | "request_invalid"
  | "port_accepted"
  | "port_rejected"
  | "port_indeterminate"
  | "invalid_port_result"
  | "port_failed";

export type AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    closureAttempted: boolean;
    closureRequested: boolean;
    lifecycleClosed: false;
  }>;

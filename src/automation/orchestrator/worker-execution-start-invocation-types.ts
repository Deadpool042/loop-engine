export type AutomationOrchestratorWorkerExecutionStartInvocationStatus =
  "start_accepted" | "start_rejected" | "start_indeterminate";
export type AutomationOrchestratorWorkerExecutionStartInvocationReason =
  | "request_invalid"
  | "port_accepted"
  | "port_rejected"
  | "port_indeterminate"
  | "invalid_port_result"
  | "port_failed";
export type AutomationOrchestratorWorkerExecutionStartInvocationResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionStartInvocationStatus;
    reason: AutomationOrchestratorWorkerExecutionStartInvocationReason;
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    startAttempted: boolean;
    startRequested: boolean;
    executionStarted: false;
  }>;

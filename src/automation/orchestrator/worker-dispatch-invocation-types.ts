export type AutomationOrchestratorWorkerDispatchInvocationStatus =
  "accepted" | "rejected" | "indeterminate";

export type AutomationOrchestratorWorkerDispatchInvocationReason =
  | "port_accepted"
  | "port_rejected"
  | "port_indeterminate"
  | "invalid_request"
  | "invalid_port_result"
  | "port_failed";

export type AutomationOrchestratorWorkerDispatchInvocation = Readonly<{
  status: AutomationOrchestratorWorkerDispatchInvocationStatus;
  reason: AutomationOrchestratorWorkerDispatchInvocationReason;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  dispatchAttempted: boolean;
  dispatchOccurred: boolean;
  workerSelected: boolean;
  providerInvoked: boolean;
  forgeInvoked: boolean;
  executionStarted: boolean;
}>;

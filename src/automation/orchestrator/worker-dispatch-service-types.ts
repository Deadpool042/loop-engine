export type AutomationOrchestratorWorkerDispatchServiceStatus =
  "accepted" | "rejected" | "indeterminate";

export type AutomationOrchestratorWorkerDispatchServiceReason =
  | "dispatch_accepted"
  | "dispatch_rejected"
  | "dispatch_indeterminate"
  | "command_rejected"
  | "invalid_command"
  | "invalid_port_result"
  | "port_failed";

export type AutomationOrchestratorWorkerDispatchServiceResult = Readonly<{
  status: AutomationOrchestratorWorkerDispatchServiceStatus;
  reason: AutomationOrchestratorWorkerDispatchServiceReason;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  requestPrepared: boolean;
  dispatchAttempted: boolean;
  dispatchOccurred: boolean;
  workerSelected: boolean;
  providerInvoked: boolean;
  forgeInvoked: boolean;
  executionStarted: boolean;
}>;

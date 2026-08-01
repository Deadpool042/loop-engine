export type AutomationOrchestratorWorkerDispatchRequestStatus =
  "prepared" | "rejected";
export type AutomationOrchestratorWorkerDispatchRequestReason =
  "command_prepared" | "command_rejected" | "invalid_command";
export type AutomationOrchestratorWorkerDispatchRequest = Readonly<{
  status: AutomationOrchestratorWorkerDispatchRequestStatus;
  prepared: boolean;
  reason: AutomationOrchestratorWorkerDispatchRequestReason;
  kind: "execute_delegated_task" | null;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  dispatchRequested: false;
  dispatchOccurred: false;
  workerSelected: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
}>;
export type AutomationOrchestratorWorkerDispatchResultStatus =
  "accepted" | "rejected" | "indeterminate";
export type AutomationOrchestratorWorkerDispatchResultReason =
  | "adapter_accepted"
  | "adapter_rejected"
  | "adapter_indeterminate"
  | "invalid_result";
export type AutomationOrchestratorWorkerDispatchResult = Readonly<{
  status: AutomationOrchestratorWorkerDispatchResultStatus;
  reason: AutomationOrchestratorWorkerDispatchResultReason;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  dispatchOccurred: boolean;
  workerSelected: boolean;
  providerInvoked: boolean;
  forgeInvoked: boolean;
  executionStarted: boolean;
}>;
export interface AutomationOrchestratorWorkerDispatchPort {
  dispatch(
    request: AutomationOrchestratorWorkerDispatchRequest,
  ): Promise<AutomationOrchestratorWorkerDispatchResult>;
}

export type AutomationOrchestratorWorkerCommandStatus = "prepared" | "rejected";

export type AutomationOrchestratorWorkerCommandReason =
  "handoff_prepared" | "handoff_rejected" | "invalid_handoff";

export type AutomationOrchestratorWorkerCommandKind = "execute_delegated_task";

export type AutomationOrchestratorWorkerCommand = Readonly<{
  status: AutomationOrchestratorWorkerCommandStatus;
  prepared: boolean;
  reason: AutomationOrchestratorWorkerCommandReason;
  kind: AutomationOrchestratorWorkerCommandKind | null;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  workerSelected: false;
  commandDispatched: false;
  dispatchOccurred: false;
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
}>;

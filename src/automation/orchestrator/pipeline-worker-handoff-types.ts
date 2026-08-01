export type AutomationOrchestratorPipelineHandoffStatus =
  "prepared" | "rejected";

export type AutomationOrchestratorPipelineHandoffReason =
  "admission_accepted" | "admission_rejected" | "invalid_admission";

export type AutomationOrchestratorPipelineWorkerHandoff = Readonly<{
  status: AutomationOrchestratorPipelineHandoffStatus;
  prepared: boolean;
  reason: AutomationOrchestratorPipelineHandoffReason;
  progression: "dispatch" | null;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  workerSelected: false;
  commandCreated: false;
  dispatchOccurred: false;
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
}>;

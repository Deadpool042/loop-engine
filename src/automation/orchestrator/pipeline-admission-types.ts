import type { AutomationOrchestratorPipelineProgression } from "./pipeline-types.js";

export type AutomationOrchestratorPipelineAdmissionStatus =
  "admitted" | "rejected" | "indeterminate";

export type AutomationOrchestratorPipelineAdmissionReason =
  | "dispatch_prepared"
  | "pipeline_rejected"
  | "pipeline_indeterminate"
  | "invalid_summary";

export type AutomationOrchestratorPipelineAdmissionDecision = Readonly<{
  status: AutomationOrchestratorPipelineAdmissionStatus;
  admitted: boolean;
  reason: AutomationOrchestratorPipelineAdmissionReason;
  progression: AutomationOrchestratorPipelineProgression | null;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  dispatchOccurred: false;
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
}>;

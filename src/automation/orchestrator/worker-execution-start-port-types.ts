import type { AutomationOrchestratorWorkerExecutionStartRequest } from "./worker-execution-start-request-preparation-types.js";
export type AutomationOrchestratorWorkerExecutionStartPortStatus =
  "accepted" | "rejected" | "indeterminate";
export type AutomationOrchestratorWorkerExecutionStartPortReason =
  "adapter_accepted" | "adapter_rejected" | "adapter_indeterminate";
export type AutomationOrchestratorWorkerExecutionStartPortResult = Readonly<{
  status: AutomationOrchestratorWorkerExecutionStartPortStatus;
  reason: AutomationOrchestratorWorkerExecutionStartPortReason;
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
  startRequested: boolean;
  executionStarted: false;
}>;
export interface AutomationOrchestratorWorkerExecutionStartPort {
  start(
    request: AutomationOrchestratorWorkerExecutionStartRequest,
  ): Promise<AutomationOrchestratorWorkerExecutionStartPortResult>;
}

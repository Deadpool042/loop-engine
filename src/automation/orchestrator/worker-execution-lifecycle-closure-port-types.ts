import type { AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult } from "./worker-execution-lifecycle-closure-preparation-types.js";

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePortStatus =
  | "accepted"
  | "rejected"
  | "indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePortReason =
  | "adapter_accepted"
  | "adapter_rejected"
  | "adapter_indeterminate";

export type AutomationOrchestratorWorkerExecutionLifecycleClosurePortResult =
  Readonly<{
    status: AutomationOrchestratorWorkerExecutionLifecycleClosurePortStatus;
    reason: AutomationOrchestratorWorkerExecutionLifecycleClosurePortReason;
    requestId: string;
    delegationId: string;
    candidateId: string;
    targetId: string;
    closureRequested: boolean;
    lifecycleClosed: false;
  }>;

export interface AutomationOrchestratorWorkerExecutionLifecycleClosurePort {
  close(
    request: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult,
  ): Promise<AutomationOrchestratorWorkerExecutionLifecycleClosurePortResult>;
}

export type AutomationOrchestratorWorkerExecutionStartServiceStatus =
  | "start_accepted"
  | "start_rejected"
  | "start_indeterminate"
  | "start_request_rejected"
  | "start_request_indeterminate";
export type AutomationOrchestratorWorkerExecutionStartServiceReason =
  | "port_accepted"
  | "port_rejected"
  | "port_indeterminate"
  | "request_rejected"
  | "request_indeterminate"
  | "request_invalid"
  | "invalid_port_result"
  | "port_failed";
export type AutomationOrchestratorWorkerExecutionStartServiceResult = Readonly<{
  status: AutomationOrchestratorWorkerExecutionStartServiceStatus;
  reason: AutomationOrchestratorWorkerExecutionStartServiceReason;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  requestPrepared: boolean;
  startAttempted: boolean;
  executionStarted: false;
}>;

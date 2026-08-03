export type AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest =
  Readonly<{
    requestId: string;
    delegationId: string;
    candidateId: string;
    targetId: string;
  }>;

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult =
  Readonly<{
    status: "accepted" | "rejected" | "indeterminate";
    requestId: string;
    delegationId: string;
    candidateId: string;
    targetId: string;
  }>;

export interface AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort {
  publish(
    request: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
  ):
    | AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult
    | Promise<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult>;
}

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult =
  Readonly<{
    status:
      | "publication_accepted"
      | "publication_rejected"
      | "publication_indeterminate";
    reason:
      | "port_accepted"
      | "port_rejected"
      | "port_indeterminate"
      | "invalid_request"
      | "port_failed"
      | "invalid_port_result";
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    publicationAttempted: boolean;
    terminalPublished: boolean;
  }>;

export type AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt =
  Readonly<{
    status:
      | "publication_confirmed"
      | "publication_rejected"
      | "publication_indeterminate";
    reason:
      | "publication_accepted"
      | "publication_rejected"
      | "publication_indeterminate"
      | "invalid_invocation";
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
    publicationAttempted: boolean;
    terminalPublished: boolean;
    terminalPublicationConfirmed: boolean;
  }>;

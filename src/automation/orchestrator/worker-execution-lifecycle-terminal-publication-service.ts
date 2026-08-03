import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult } from "./worker-execution-lifecycle-terminal-receipt-types.js";
import {
  invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication,
  prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
  validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt,
} from "./worker-execution-lifecycle-terminal-publication.js";
import type {
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt,
} from "./worker-execution-lifecycle-terminal-publication-types.js";

/**
 * Consolidated V22.1 service boundary.
 *
 * It composes request preparation, the single publication-port invocation and
 * receipt validation without adding adapters, retries, persistence, timing or
 * identifier generation.
 */
export async function publishAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
  terminalReceipt: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult,
  port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort,
): Promise<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt> {
  const request =
    prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest(
      terminalReceipt,
    );

  if (request === null) {
    return validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt(
      Object.freeze({
        status: "publication_rejected",
        reason: "invalid_request",
        requestId: null,
        delegationId: null,
        candidateId: null,
        targetId: null,
        publicationAttempted: false,
        terminalPublished: false,
      }),
    );
  }

  const invocation =
    await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
      request,
      port,
    );

  return validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt(
    invocation,
  );
}

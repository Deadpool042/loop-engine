import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult } from "./worker-execution-lifecycle-terminal-receipt-types.js";
import type {
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
} from "./worker-execution-lifecycle-terminal-publication-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function ids(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.requestId !== "string" ||
    typeof source.delegationId !== "string" ||
    typeof source.candidateId !== "string" ||
    typeof source.targetId !== "string"
  ) return null;
  return Object.freeze({
    requestId: source.requestId,
    delegationId: source.delegationId,
    candidateId: source.candidateId,
    targetId: source.targetId,
  });
}

export function prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest(
  receipt: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest | null {
  const identifiers = ids(receipt);
  if (
    identifiers === null ||
    receipt.status !== "terminal_confirmed" ||
    receipt.reason !== "terminal_state_confirmed" ||
    receipt.lifecycleClosed !== true ||
    receipt.terminal !== true ||
    receipt.terminalConfirmed !== true
  ) return null;
  return Object.freeze({ ...identifiers });
}

function invocation(
  status: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult["reason"],
  identifiers: Ids | null,
  attempted: boolean,
  published: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult {
  return Object.freeze({
    status,
    reason,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    publicationAttempted: attempted,
    terminalPublished: published,
  });
}

function coherent(
  expected: Ids,
  result: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult,
): boolean {
  return (
    result.requestId === expected.requestId &&
    result.delegationId === expected.delegationId &&
    result.candidateId === expected.candidateId &&
    result.targetId === expected.targetId
  );
}

export async function invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
  request: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
  port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort,
): Promise<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult> {
  const identifiers = ids(request);
  if (identifiers === null || typeof port?.publish !== "function") {
    return invocation("publication_rejected", "invalid_request", null, false, false);
  }

  let portResult: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPortResult;
  try {
    portResult = await port.publish(request);
  } catch {
    return invocation("publication_indeterminate", "port_failed", identifiers, true, false);
  }

  if (ids(portResult) === null || !coherent(identifiers, portResult)) {
    return invocation("publication_indeterminate", "invalid_port_result", identifiers, true, false);
  }

  if (portResult.status === "accepted") {
    return invocation("publication_accepted", "port_accepted", identifiers, true, true);
  }
  if (portResult.status === "rejected") {
    return invocation("publication_rejected", "port_rejected", identifiers, true, false);
  }
  if (portResult.status === "indeterminate") {
    return invocation("publication_indeterminate", "port_indeterminate", identifiers, true, false);
  }
  return invocation("publication_indeterminate", "invalid_port_result", identifiers, true, false);
}

function receipt(
  status: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt["reason"],
  identifiers: Ids | null,
  attempted: boolean,
  published: boolean,
  confirmed: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt {
  return Object.freeze({
    status,
    reason,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    publicationAttempted: attempted,
    terminalPublished: published,
    terminalPublicationConfirmed: confirmed,
  });
}

export function validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt(
  result: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationInvocationResult,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt {
  const identifiers = ids(result);
  if (
    identifiers !== null &&
    result.status === "publication_accepted" &&
    result.reason === "port_accepted" &&
    result.publicationAttempted === true &&
    result.terminalPublished === true
  ) return receipt("publication_confirmed", "publication_accepted", identifiers, true, true, true);

  if (
    identifiers !== null &&
    result.status === "publication_rejected" &&
    result.reason === "port_rejected" &&
    result.publicationAttempted === true &&
    result.terminalPublished === false
  ) return receipt("publication_rejected", "publication_rejected", identifiers, true, false, false);

  if (
    identifiers !== null &&
    result.status === "publication_indeterminate" &&
    ["port_indeterminate", "port_failed", "invalid_port_result"].includes(result.reason) &&
    result.publicationAttempted === true &&
    result.terminalPublished === false
  ) return receipt("publication_indeterminate", "publication_indeterminate", identifiers, true, false, false);

  return receipt("publication_rejected", "invalid_invocation", null, false, false, false);
}

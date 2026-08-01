import type { AutomationOrchestratorWorkerExecutionStartServiceResult } from "./worker-execution-start-service-types.js";
import type {
  AutomationOrchestratorWorkerExecutionStartReceipt,
  AutomationOrchestratorWorkerExecutionStartReceiptValidationReason,
  AutomationOrchestratorWorkerExecutionStartReceiptValidationResult,
  AutomationOrchestratorWorkerExecutionStartReceiptValidationStatus,
} from "./worker-execution-start-receipt-types.js";

type Identifiers = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function result(
  status: AutomationOrchestratorWorkerExecutionStartReceiptValidationStatus,
  reason: AutomationOrchestratorWorkerExecutionStartReceiptValidationReason,
  identifiers: Identifiers | null,
  executionStarted: boolean,
): AutomationOrchestratorWorkerExecutionStartReceiptValidationResult {
  return Object.freeze({
    status,
    reason,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    executionStarted,
  });
}

function identifiersFromService(
  serviceResult: AutomationOrchestratorWorkerExecutionStartServiceResult,
): Identifiers | null {
  const { requestId, delegationId, candidateId, targetId } = serviceResult;
  return typeof requestId === "string" &&
    typeof delegationId === "string" &&
    typeof candidateId === "string" &&
    typeof targetId === "string"
    ? Object.freeze({ requestId, delegationId, candidateId, targetId })
    : null;
}

function isValidServiceResult(
  value: unknown,
): value is AutomationOrchestratorWorkerExecutionStartServiceResult {
  if (value === null || typeof value !== "object") return false;
  const serviceResult =
    value as AutomationOrchestratorWorkerExecutionStartServiceResult;
  return (
    [
      "start_accepted",
      "start_rejected",
      "start_indeterminate",
      "start_request_rejected",
      "start_request_indeterminate",
    ].includes(serviceResult.status) &&
    typeof serviceResult.reason === "string" &&
    serviceResult.executionStarted === false &&
    identifiersFromService(serviceResult) !== null
  );
}

function isValidReceipt(
  value: unknown,
): value is AutomationOrchestratorWorkerExecutionStartReceipt {
  if (value === null || typeof value !== "object") return false;
  const receipt = value as AutomationOrchestratorWorkerExecutionStartReceipt;
  return (
    ["started", "not_started", "indeterminate"].includes(receipt.status) &&
    [
      "execution_started",
      "execution_not_started",
      "execution_indeterminate",
    ].includes(receipt.reason) &&
    typeof receipt.requestId === "string" &&
    typeof receipt.delegationId === "string" &&
    typeof receipt.candidateId === "string" &&
    typeof receipt.targetId === "string" &&
    typeof receipt.executionStarted === "boolean"
  );
}

function matchesIdentifiers(
  receipt: AutomationOrchestratorWorkerExecutionStartReceipt,
  identifiers: Identifiers,
): boolean {
  return (
    receipt.requestId === identifiers.requestId &&
    receipt.delegationId === identifiers.delegationId &&
    receipt.candidateId === identifiers.candidateId &&
    receipt.targetId === identifiers.targetId
  );
}

export function validateAutomationOrchestratorWorkerExecutionStartReceipt(
  serviceResult: AutomationOrchestratorWorkerExecutionStartServiceResult,
  receipt: unknown,
): AutomationOrchestratorWorkerExecutionStartReceiptValidationResult {
  if (!isValidServiceResult(serviceResult))
    return result("receipt_rejected", "invalid_service_result", null, false);

  const identifiers = identifiersFromService(serviceResult);
  if (identifiers === null)
    return result("receipt_rejected", "invalid_service_result", null, false);
  if (!isValidReceipt(receipt))
    return result("receipt_rejected", "invalid_receipt", null, false);
  if (!matchesIdentifiers(receipt, identifiers))
    return result("receipt_rejected", "identifier_mismatch", null, false);

  if (
    receipt.status === "started" &&
    receipt.reason === "execution_started" &&
    receipt.executionStarted === true &&
    serviceResult.status === "start_accepted"
  )
    return result("receipt_accepted", "execution_started", identifiers, true);

  if (
    receipt.status === "not_started" &&
    receipt.reason === "execution_not_started" &&
    receipt.executionStarted === false
  )
    return result(
      "receipt_rejected",
      "execution_not_started",
      identifiers,
      false,
    );

  if (
    receipt.status === "indeterminate" &&
    receipt.reason === "execution_indeterminate" &&
    receipt.executionStarted === false
  )
    return result(
      "receipt_indeterminate",
      "execution_indeterminate",
      identifiers,
      false,
    );

  return result("receipt_rejected", "invalid_receipt", null, false);
}

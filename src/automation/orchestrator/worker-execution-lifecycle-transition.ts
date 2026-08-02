import type { AutomationOrchestratorWorkerExecutionLifecycleInitializationResult } from "./worker-execution-lifecycle-initialization-types.js";
import type { AutomationOrchestratorWorkerExecutionStartReceiptValidationResult } from "./worker-execution-start-receipt-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTransitionResult } from "./worker-execution-lifecycle-transition-types.js";

type Identifiers = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;
function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleTransitionResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleTransitionResult["reason"],
  ids: Identifiers | null,
  executionStarted: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleTransitionResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    executionStarted,
  });
}
function identifiers(
  value: Readonly<{
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
  }>,
): Identifiers | null {
  return typeof value.requestId === "string" &&
    typeof value.delegationId === "string" &&
    typeof value.candidateId === "string" &&
    typeof value.targetId === "string"
    ? Object.freeze({
        requestId: value.requestId,
        delegationId: value.delegationId,
        candidateId: value.candidateId,
        targetId: value.targetId,
      })
    : null;
}
export function transitionAutomationOrchestratorWorkerExecutionLifecycle(
  lifecycle: AutomationOrchestratorWorkerExecutionLifecycleInitializationResult,
  receiptValidation: AutomationOrchestratorWorkerExecutionStartReceiptValidationResult,
): AutomationOrchestratorWorkerExecutionLifecycleTransitionResult {
  const ids = identifiers(lifecycle);
  const receiptIds = identifiers(receiptValidation);
  if (
    lifecycle.status !== "execution_pending" ||
    lifecycle.reason !== "dispatch_accepted" ||
    lifecycle.executionStarted !== false ||
    ids === null
  )
    return result("transition_rejected", "invalid_lifecycle", null, false);
  if (receiptIds === null)
    return result(
      "transition_rejected",
      "invalid_receipt_validation",
      null,
      false,
    );
  if (
    ids.requestId !== receiptIds.requestId ||
    ids.delegationId !== receiptIds.delegationId ||
    ids.candidateId !== receiptIds.candidateId ||
    ids.targetId !== receiptIds.targetId
  )
    return result("transition_rejected", "identifier_mismatch", null, false);
  if (
    receiptValidation.status === "receipt_accepted" &&
    receiptValidation.reason === "execution_started" &&
    receiptValidation.executionStarted === true
  )
    return result("execution_started", "receipt_confirmed", ids, true);
  if (
    receiptValidation.status === "receipt_rejected" &&
    receiptValidation.reason === "execution_not_started" &&
    receiptValidation.executionStarted === false
  )
    return result("execution_not_started", "receipt_not_started", ids, false);
  if (
    receiptValidation.status === "receipt_indeterminate" &&
    receiptValidation.reason === "execution_indeterminate" &&
    receiptValidation.executionStarted === false
  )
    return result(
      "execution_indeterminate",
      "receipt_indeterminate",
      ids,
      false,
    );
  return result(
    "transition_rejected",
    "invalid_receipt_validation",
    null,
    false,
  );
}

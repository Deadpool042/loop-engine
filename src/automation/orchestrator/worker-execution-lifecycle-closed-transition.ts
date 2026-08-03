import type { AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult } from "./worker-execution-lifecycle-closure-receipt-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult } from "./worker-execution-lifecycle-closed-transition-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function identifiers(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  if (
    typeof source.requestId !== "string" ||
    typeof source.delegationId !== "string" ||
    typeof source.candidateId !== "string" ||
    typeof source.targetId !== "string"
  ) {
    return null;
  }

  return Object.freeze({
    requestId: source.requestId,
    delegationId: source.delegationId,
    candidateId: source.candidateId,
    targetId: source.targetId,
  });
}

function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult["reason"],
  ids: Ids | null,
  closed: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    executionStarted: ids !== null,
    executionFinished: ids !== null,
    lifecycleFinalized: ids !== null,
    lifecycleClosed: closed,
  });
}

/** Pure V21.12 transition from a validated closure receipt. */
export function transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed(
  receipt: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult,
): AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult {
  const ids = identifiers(receipt);

  if (
    ids !== null &&
    receipt.status === "closure_confirmed" &&
    receipt.reason === "closure_accepted" &&
    receipt.closureAttempted === true &&
    receipt.closureRequested === true &&
    receipt.lifecycleClosed === true
  ) {
    return result("lifecycle_closed", "closure_confirmed", ids, true);
  }

  if (
    ids !== null &&
    receipt.status === "closure_rejected" &&
    receipt.reason === "closure_rejected" &&
    receipt.closureAttempted === true &&
    receipt.closureRequested === false &&
    receipt.lifecycleClosed === false
  ) {
    return result("lifecycle_not_closed", "closure_rejected", ids, false);
  }

  if (
    ids !== null &&
    receipt.status === "closure_indeterminate" &&
    receipt.reason === "closure_indeterminate" &&
    receipt.closureAttempted === true &&
    typeof receipt.closureRequested === "boolean" &&
    receipt.lifecycleClosed === false
  ) {
    return result("lifecycle_indeterminate", "closure_indeterminate", ids, false);
  }

  return result("transition_rejected", "invalid_receipt", null, false);
}

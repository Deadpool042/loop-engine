import type { AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult } from "./worker-execution-lifecycle-closure-invocation-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult } from "./worker-execution-lifecycle-closure-receipt-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function identifiers(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.requestId !== "string" ||
    typeof source.delegationId !== "string" ||
    typeof source.candidateId !== "string" ||
    typeof source.targetId !== "string"
  )
    return null;
  return Object.freeze({
    requestId: source.requestId,
    delegationId: source.delegationId,
    candidateId: source.candidateId,
    targetId: source.targetId,
  });
}

function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult["reason"],
  ids: Ids | null,
  attempted = false,
  requested = false,
  closed = false,
): AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    closureAttempted: attempted,
    closureRequested: requested,
    lifecycleClosed: closed,
  });
}

/** Pure V21.11 validation boundary. It performs no port call or operational effect. */
export function validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt(
  invocation: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult,
): AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult {
  const ids = identifiers(invocation);

  if (
    ids !== null &&
    invocation.status === "closure_accepted" &&
    invocation.reason === "port_accepted" &&
    invocation.closureAttempted === true &&
    invocation.closureRequested === true &&
    invocation.lifecycleClosed === false
  )
    return result("closure_confirmed", "closure_accepted", ids, true, true, true);

  if (
    ids !== null &&
    invocation.status === "closure_rejected" &&
    invocation.reason === "port_rejected" &&
    invocation.closureAttempted === true &&
    invocation.closureRequested === false &&
    invocation.lifecycleClosed === false
  )
    return result("closure_rejected", "closure_rejected", ids, true, false, false);

  if (
    ids !== null &&
    invocation.status === "closure_indeterminate" &&
    invocation.reason === "port_indeterminate" &&
    invocation.closureAttempted === true &&
    typeof invocation.closureRequested === "boolean" &&
    invocation.lifecycleClosed === false
  )
    return result(
      "closure_indeterminate",
      "closure_indeterminate",
      ids,
      true,
      invocation.closureRequested,
      false,
    );

  return result("closure_rejected", "invalid_invocation", null);
}

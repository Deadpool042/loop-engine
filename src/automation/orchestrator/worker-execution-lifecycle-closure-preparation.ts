import type { AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult } from "./worker-execution-lifecycle-closure-preparation-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult } from "./worker-execution-lifecycle-finalization-types.js";

type Identifiers = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

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

function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult["reason"],
  ids: Identifiers | null,
  executionStarted = false,
  executionFinished = false,
  executionSucceeded = false,
  lifecycleFinalized = false,
  closureRequired = false,
): AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    executionStarted,
    executionFinished,
    executionSucceeded,
    lifecycleFinalized,
    closureRequired,
  });
}

export function prepareAutomationOrchestratorWorkerExecutionLifecycleClosure(
  finalization: AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult,
): AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult {
  const ids = identifiers(finalization);

  if (ids === null)
    return result("closure_rejected", "invalid_finalization", null);

  if (
    finalization.status === "lifecycle_finalized" &&
    finalization.reason === "execution_completed" &&
    finalization.executionStarted === true &&
    finalization.executionFinished === true &&
    finalization.executionSucceeded === true &&
    finalization.lifecycleFinalized === true
  )
    return result(
      "closure_ready",
      "completed_lifecycle",
      ids,
      true,
      true,
      true,
      true,
      true,
    );

  if (
    finalization.status === "lifecycle_finalized" &&
    finalization.reason === "execution_failed" &&
    finalization.executionStarted === true &&
    finalization.executionFinished === true &&
    finalization.executionSucceeded === false &&
    finalization.lifecycleFinalized === true
  )
    return result(
      "closure_ready",
      "failed_lifecycle",
      ids,
      true,
      true,
      false,
      true,
      true,
    );

  if (
    finalization.status === "lifecycle_active" &&
    finalization.reason === "execution_running" &&
    finalization.executionStarted === true &&
    finalization.executionFinished === false &&
    finalization.executionSucceeded === false &&
    finalization.lifecycleFinalized === false
  )
    return result(
      "closure_not_required",
      "active_lifecycle",
      ids,
      true,
      false,
      false,
    );

  if (
    finalization.status === "lifecycle_indeterminate" &&
    finalization.reason === "execution_indeterminate" &&
    finalization.executionStarted === false &&
    finalization.executionFinished === false &&
    finalization.executionSucceeded === false &&
    finalization.lifecycleFinalized === false
  )
    return result("closure_indeterminate", "indeterminate_lifecycle", ids);

  return result("closure_rejected", "invalid_finalization", null);
}

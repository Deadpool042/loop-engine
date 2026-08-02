import type { AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult } from "./worker-execution-lifecycle-finalization-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleProgressionResult } from "./worker-execution-lifecycle-progression-types.js";

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
  status: AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult["reason"],
  ids: Identifiers | null,
  executionStarted = false,
  executionFinished = false,
  executionSucceeded = false,
  lifecycleFinalized = false,
): AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult {
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
  });
}

export function finalizeAutomationOrchestratorWorkerExecutionLifecycle(
  progression: AutomationOrchestratorWorkerExecutionLifecycleProgressionResult,
): AutomationOrchestratorWorkerExecutionLifecycleFinalizationResult {
  const ids = identifiers(progression);

  if (ids === null)
    return result("finalization_rejected", "invalid_progression", null);

  if (
    progression.status === "execution_completed" &&
    progression.reason === "observation_completed" &&
    progression.executionStarted === true &&
    progression.executionFinished === true &&
    progression.executionSucceeded === true
  )
    return result(
      "lifecycle_finalized",
      "execution_completed",
      ids,
      true,
      true,
      true,
      true,
    );

  if (
    progression.status === "execution_failed" &&
    progression.reason === "observation_failed" &&
    progression.executionStarted === true &&
    progression.executionFinished === true &&
    progression.executionSucceeded === false
  )
    return result(
      "lifecycle_finalized",
      "execution_failed",
      ids,
      true,
      true,
      false,
      true,
    );

  if (
    progression.status === "execution_running" &&
    progression.reason === "observation_running" &&
    progression.executionStarted === true &&
    progression.executionFinished === false &&
    progression.executionSucceeded === false
  )
    return result(
      "lifecycle_active",
      "execution_running",
      ids,
      true,
      false,
      false,
    );

  if (
    progression.status === "execution_indeterminate" &&
    progression.reason === "observation_indeterminate" &&
    progression.executionStarted === false &&
    progression.executionFinished === false &&
    progression.executionSucceeded === false
  )
    return result("lifecycle_indeterminate", "execution_indeterminate", ids);

  return result("finalization_rejected", "invalid_progression", null);
}

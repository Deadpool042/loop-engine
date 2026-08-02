import type { AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult } from "./worker-execution-lifecycle-observation-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleProgressionResult } from "./worker-execution-lifecycle-progression-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTransitionResult } from "./worker-execution-lifecycle-transition-types.js";

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
  status: AutomationOrchestratorWorkerExecutionLifecycleProgressionResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleProgressionResult["reason"],
  ids: Identifiers | null,
  executionStarted = false,
  executionFinished = false,
  executionSucceeded = false,
): AutomationOrchestratorWorkerExecutionLifecycleProgressionResult {
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
  });
}

export function progressAutomationOrchestratorWorkerExecutionLifecycle(
  lifecycle: AutomationOrchestratorWorkerExecutionLifecycleTransitionResult,
  observationValidation: AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult,
): AutomationOrchestratorWorkerExecutionLifecycleProgressionResult {
  const lifecycleIds = identifiers(lifecycle);
  const observationIds = identifiers(observationValidation);

  if (
    lifecycle.status !== "execution_started" ||
    lifecycle.reason !== "receipt_confirmed" ||
    lifecycle.executionStarted !== true ||
    lifecycleIds === null
  )
    return result("progression_rejected", "invalid_lifecycle", null);

  if (observationIds === null)
    return result(
      "progression_rejected",
      "invalid_observation_validation",
      null,
    );

  if (
    lifecycleIds.requestId !== observationIds.requestId ||
    lifecycleIds.delegationId !== observationIds.delegationId ||
    lifecycleIds.candidateId !== observationIds.candidateId ||
    lifecycleIds.targetId !== observationIds.targetId
  )
    return result("progression_rejected", "identifier_mismatch", null);

  if (
    observationValidation.status === "observation_accepted" &&
    observationValidation.reason === "execution_running" &&
    observationValidation.executionStarted === true &&
    observationValidation.executionFinished === false &&
    observationValidation.executionSucceeded === false
  )
    return result(
      "execution_running",
      "observation_running",
      lifecycleIds,
      true,
      false,
      false,
    );

  if (
    observationValidation.status === "observation_accepted" &&
    observationValidation.reason === "execution_completed" &&
    observationValidation.executionStarted === true &&
    observationValidation.executionFinished === true &&
    observationValidation.executionSucceeded === true
  )
    return result(
      "execution_completed",
      "observation_completed",
      lifecycleIds,
      true,
      true,
      true,
    );

  if (
    observationValidation.status === "observation_accepted" &&
    observationValidation.reason === "execution_failed" &&
    observationValidation.executionStarted === true &&
    observationValidation.executionFinished === true &&
    observationValidation.executionSucceeded === false
  )
    return result(
      "execution_failed",
      "observation_failed",
      lifecycleIds,
      true,
      true,
      false,
    );

  if (
    observationValidation.status === "observation_indeterminate" &&
    observationValidation.reason === "execution_indeterminate" &&
    observationValidation.executionStarted === false &&
    observationValidation.executionFinished === false &&
    observationValidation.executionSucceeded === false
  )
    return result(
      "execution_indeterminate",
      "observation_indeterminate",
      lifecycleIds,
    );

  return result("progression_rejected", "invalid_observation_validation", null);
}

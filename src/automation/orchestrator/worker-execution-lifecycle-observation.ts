import type { AutomationOrchestratorWorkerExecutionLifecycleTransitionResult } from "./worker-execution-lifecycle-transition-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult } from "./worker-execution-lifecycle-observation-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;
function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult["reason"],
  ids: Ids | null,
  executionStarted = false,
  executionFinished = false,
  executionSucceeded = false,
): AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult {
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
function ids(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.requestId === "string" &&
    typeof v.delegationId === "string" &&
    typeof v.candidateId === "string" &&
    typeof v.targetId === "string"
    ? Object.freeze({
        requestId: v.requestId,
        delegationId: v.delegationId,
        candidateId: v.candidateId,
        targetId: v.targetId,
      })
    : null;
}
export function validateAutomationOrchestratorWorkerExecutionLifecycleObservation(
  lifecycle: AutomationOrchestratorWorkerExecutionLifecycleTransitionResult,
  observation: unknown,
): AutomationOrchestratorWorkerExecutionLifecycleObservationValidationResult {
  const lifecycleIds = ids(lifecycle);
  const observationIds = ids(observation);
  if (
    lifecycle.status !== "execution_started" ||
    lifecycle.reason !== "receipt_confirmed" ||
    lifecycle.executionStarted !== true ||
    lifecycleIds === null
  )
    return result("observation_rejected", "invalid_lifecycle", null);
  if (
    observationIds === null ||
    typeof observation !== "object" ||
    observation === null
  )
    return result("observation_rejected", "invalid_observation", null);
  if (
    lifecycleIds.requestId !== observationIds.requestId ||
    lifecycleIds.delegationId !== observationIds.delegationId ||
    lifecycleIds.candidateId !== observationIds.candidateId ||
    lifecycleIds.targetId !== observationIds.targetId
  )
    return result("observation_rejected", "identifier_mismatch", null);
  const o = observation as Record<string, unknown>;
  if (
    o.status === "running" &&
    o.reason === "execution_running" &&
    o.executionStarted === true &&
    o.executionFinished === false &&
    o.executionSucceeded === false
  )
    return result(
      "observation_accepted",
      "execution_running",
      lifecycleIds,
      true,
      false,
      false,
    );
  if (
    o.status === "completed" &&
    o.reason === "execution_completed" &&
    o.executionStarted === true &&
    o.executionFinished === true &&
    o.executionSucceeded === true
  )
    return result(
      "observation_accepted",
      "execution_completed",
      lifecycleIds,
      true,
      true,
      true,
    );
  if (
    o.status === "failed" &&
    o.reason === "execution_failed" &&
    o.executionStarted === true &&
    o.executionFinished === true &&
    o.executionSucceeded === false
  )
    return result(
      "observation_accepted",
      "execution_failed",
      lifecycleIds,
      true,
      true,
      false,
    );
  if (
    o.status === "indeterminate" &&
    o.reason === "execution_indeterminate" &&
    o.executionStarted === false &&
    o.executionFinished === false &&
    o.executionSucceeded === false
  )
    return result(
      "observation_indeterminate",
      "execution_indeterminate",
      lifecycleIds,
    );
  return result("observation_rejected", "invalid_observation", null);
}

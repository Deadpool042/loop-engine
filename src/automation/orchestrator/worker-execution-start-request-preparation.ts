import type { AutomationOrchestratorWorkerExecutionLifecycleInitializationResult } from "./worker-execution-lifecycle-initialization-types.js";
import type {
  AutomationOrchestratorWorkerExecutionStartPreparationResult,
  AutomationOrchestratorWorkerExecutionStartRequest,
} from "./worker-execution-start-request-preparation-types.js";
type Source = Readonly<Record<string, unknown>>;
function request(
  source: Source,
): AutomationOrchestratorWorkerExecutionStartRequest | null {
  if (
    [
      source.requestId,
      source.delegationId,
      source.candidateId,
      source.targetId,
    ].some((value) => typeof value !== "string")
  )
    return null;
  return Object.freeze({
    requestId: source.requestId as string,
    delegationId: source.delegationId as string,
    candidateId: source.candidateId as string,
    targetId: source.targetId as string,
    executionStarted: false,
  });
}
function result(
  status: AutomationOrchestratorWorkerExecutionStartPreparationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionStartPreparationResult["reason"],
  value: AutomationOrchestratorWorkerExecutionStartRequest | null,
): AutomationOrchestratorWorkerExecutionStartPreparationResult {
  return Object.freeze({
    status,
    reason,
    request: value,
    executionStarted: false,
  });
}
/** Prepares only a declarative future start request; it never starts execution. */
export function prepareAutomationOrchestratorWorkerExecutionStartRequest(
  input: AutomationOrchestratorWorkerExecutionLifecycleInitializationResult,
): AutomationOrchestratorWorkerExecutionStartPreparationResult {
  const value: unknown = input;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result("request_rejected", "invalid_lifecycle_initialization", null);
  const source = value as Source;
  if (
    source.executionStarted !== false ||
    source.dispatchOccurred !== false ||
    source.workerSelected !== false ||
    source.providerInvoked !== false ||
    source.forgeInvoked !== false
  )
    return result("request_rejected", "invalid_lifecycle_initialization", null);
  if (
    source.status === "execution_pending" &&
    source.reason === "dispatch_accepted"
  ) {
    const prepared = request(source);
    return prepared === null
      ? result("request_rejected", "invalid_lifecycle_initialization", null)
      : result("request_prepared", "execution_pending", prepared);
  }
  if (source.status === "execution_not_started")
    return result("request_rejected", "execution_not_started", null);
  if (source.status === "execution_indeterminate")
    return result("request_indeterminate", "execution_indeterminate", null);
  return result("request_rejected", "invalid_lifecycle_initialization", null);
}

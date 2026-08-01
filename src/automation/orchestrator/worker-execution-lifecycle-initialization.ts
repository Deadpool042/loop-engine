import type { AutomationOrchestratorWorkerDispatchServiceResult } from "./worker-dispatch-service-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleInitializationResult } from "./worker-execution-lifecycle-initialization-types.js";

type Identifiers = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;
type Source = Readonly<Record<string, unknown>>;

function identifiers(source: Source): Identifiers | null {
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
  });
}
function flagsAreCoherent(source: Source): boolean {
  return (
    typeof source.dispatchOccurred === "boolean" &&
    typeof source.workerSelected === "boolean" &&
    typeof source.providerInvoked === "boolean" &&
    typeof source.forgeInvoked === "boolean" &&
    source.executionStarted === false
  );
}
function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleInitializationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleInitializationResult["reason"],
  ids: Identifiers | null,
): AutomationOrchestratorWorkerExecutionLifecycleInitializationResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}

/** Initializes only a declarative execution state; it never starts a worker. */
export function initializeAutomationOrchestratorWorkerExecutionLifecycle(
  input: AutomationOrchestratorWorkerDispatchServiceResult,
): AutomationOrchestratorWorkerExecutionLifecycleInitializationResult {
  const source: unknown = input;
  if (typeof source !== "object" || source === null || Array.isArray(source))
    return result(
      "execution_not_started",
      "invalid_dispatch_service_result",
      null,
    );
  const values = source as Source;
  const ids = identifiers(values);
  if (!flagsAreCoherent(values))
    return result(
      "execution_not_started",
      "invalid_dispatch_service_result",
      null,
    );
  if (
    values.status === "accepted" &&
    values.reason === "dispatch_accepted" &&
    values.requestPrepared === true &&
    values.dispatchAttempted === true &&
    values.dispatchOccurred === true &&
    ids !== null
  )
    return result("execution_pending", "dispatch_accepted", ids);
  if (
    values.status === "indeterminate" &&
    values.reason === "dispatch_indeterminate" &&
    ids !== null
  )
    return result("execution_indeterminate", "dispatch_indeterminate", ids);
  if (
    values.status === "rejected" &&
    ["dispatch_rejected", "command_rejected", "invalid_command"].includes(
      values.reason as string,
    )
  )
    return result(
      "execution_not_started",
      values.reason as
        "dispatch_rejected" | "command_rejected" | "invalid_command",
      ids,
    );
  if (
    values.reason === "invalid_port_result" ||
    values.reason === "port_failed"
  )
    return result("execution_not_started", values.reason, null);
  return result(
    "execution_not_started",
    "invalid_dispatch_service_result",
    null,
  );
}

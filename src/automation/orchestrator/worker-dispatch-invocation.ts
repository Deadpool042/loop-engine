import type {
  AutomationOrchestratorWorkerDispatchPort,
  AutomationOrchestratorWorkerDispatchRequest,
  AutomationOrchestratorWorkerDispatchResult,
} from "./worker-dispatch-port-types.js";
import type {
  AutomationOrchestratorWorkerDispatchInvocation,
  AutomationOrchestratorWorkerDispatchInvocationReason,
  AutomationOrchestratorWorkerDispatchInvocationStatus,
} from "./worker-dispatch-invocation-types.js";

type RecordValue = Readonly<Record<string, unknown>>;
type Identifiers = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestIdentifiers(source: RecordValue): Identifiers | null {
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

function outcome(
  status: AutomationOrchestratorWorkerDispatchInvocationStatus,
  reason: AutomationOrchestratorWorkerDispatchInvocationReason,
  attempted: boolean,
  identifiers: Identifiers | null,
  flags: Readonly<{
    dispatchOccurred: boolean;
    workerSelected: boolean;
    providerInvoked: boolean;
    forgeInvoked: boolean;
    executionStarted: boolean;
  }> | null,
): AutomationOrchestratorWorkerDispatchInvocation {
  return Object.freeze({
    status,
    reason,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    dispatchAttempted: attempted,
    dispatchOccurred: flags?.dispatchOccurred ?? false,
    workerSelected: flags?.workerSelected ?? false,
    providerInvoked: flags?.providerInvoked ?? false,
    forgeInvoked: flags?.forgeInvoked ?? false,
    executionStarted: flags?.executionStarted ?? false,
  });
}

function validRequest(request: unknown): Identifiers | null {
  if (!record(request)) return null;
  const ids = requestIdentifiers(request);
  if (
    ids === null ||
    request.status !== "prepared" ||
    request.prepared !== true ||
    request.reason !== "command_prepared" ||
    request.kind !== "execute_delegated_task" ||
    request.dispatchRequested !== false ||
    request.dispatchOccurred !== false ||
    request.workerSelected !== false ||
    request.providerInvoked !== false ||
    request.forgeInvoked !== false ||
    request.executionStarted !== false
  )
    return null;
  return ids;
}

function normalizePortResult(
  result: unknown,
  request: Identifiers,
): AutomationOrchestratorWorkerDispatchInvocation {
  if (!record(result))
    return outcome("indeterminate", "invalid_port_result", true, null, null);
  const ids = requestIdentifiers(result);
  const flags =
    typeof result.dispatchOccurred === "boolean" &&
    typeof result.workerSelected === "boolean" &&
    typeof result.providerInvoked === "boolean" &&
    typeof result.forgeInvoked === "boolean" &&
    typeof result.executionStarted === "boolean"
      ? Object.freeze({
          dispatchOccurred: result.dispatchOccurred,
          workerSelected: result.workerSelected,
          providerInvoked: result.providerInvoked,
          forgeInvoked: result.forgeInvoked,
          executionStarted: result.executionStarted,
        })
      : null;
  if (
    ids === null ||
    flags === null ||
    ids.requestId !== request.requestId ||
    ids.delegationId !== request.delegationId ||
    ids.candidateId !== request.candidateId ||
    ids.targetId !== request.targetId
  )
    return outcome("indeterminate", "invalid_port_result", true, null, null);
  if (
    result.status === "accepted" &&
    result.reason === "adapter_accepted" &&
    flags.dispatchOccurred === true
  )
    return outcome("accepted", "port_accepted", true, ids, flags);
  if (
    result.status === "rejected" &&
    result.reason === "adapter_rejected" &&
    flags.executionStarted === false
  )
    return outcome("rejected", "port_rejected", true, ids, flags);
  if (
    result.status === "indeterminate" &&
    result.reason === "adapter_indeterminate"
  )
    return outcome("indeterminate", "port_indeterminate", true, ids, flags);
  return outcome("indeterminate", "invalid_port_result", true, null, null);
}

/** The sole application boundary permitted to invoke an injected dispatch port. */
export async function invokeAutomationOrchestratorWorkerDispatch(
  request: AutomationOrchestratorWorkerDispatchRequest,
  port: AutomationOrchestratorWorkerDispatchPort,
): Promise<AutomationOrchestratorWorkerDispatchInvocation> {
  const ids = validRequest(request);
  if (ids === null)
    return outcome("rejected", "invalid_request", false, null, null);
  const candidate: unknown = port;
  if (!record(candidate) || typeof candidate.dispatch !== "function")
    return outcome("indeterminate", "port_failed", false, null, null);
  try {
    const result: AutomationOrchestratorWorkerDispatchResult =
      await port.dispatch(request);
    return normalizePortResult(result, ids);
  } catch {
    return outcome("indeterminate", "port_failed", true, null, null);
  }
}

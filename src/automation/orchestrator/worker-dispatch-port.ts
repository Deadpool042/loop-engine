import type { AutomationOrchestratorWorkerCommand } from "./worker-command-types.js";
import type {
  AutomationOrchestratorWorkerDispatchRequest,
  AutomationOrchestratorWorkerDispatchRequestReason,
} from "./worker-dispatch-port-types.js";

type RecordValue = Readonly<Record<string, unknown>>;
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function identifiers(source: RecordValue): Readonly<{
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
}> | null {
  if (
    (source.requestId !== null && typeof source.requestId !== "string") ||
    (source.delegationId !== null && typeof source.delegationId !== "string") ||
    (source.candidateId !== null && typeof source.candidateId !== "string") ||
    (source.targetId !== null && typeof source.targetId !== "string")
  )
    return null;
  return Object.freeze({
    requestId: source.requestId as string | null,
    delegationId: source.delegationId as string | null,
    candidateId: source.candidateId as string | null,
    targetId: source.targetId as string | null,
  });
}
function request(
  status: AutomationOrchestratorWorkerDispatchRequest["status"],
  reason: AutomationOrchestratorWorkerDispatchRequestReason,
  values: ReturnType<typeof identifiers>,
): AutomationOrchestratorWorkerDispatchRequest {
  return Object.freeze({
    status,
    prepared: status === "prepared",
    reason,
    kind: status === "prepared" ? "execute_delegated_task" : null,
    requestId: values?.requestId ?? null,
    delegationId: values?.delegationId ?? null,
    candidateId: values?.candidateId ?? null,
    targetId: values?.targetId ?? null,
    dispatchRequested: false,
    dispatchOccurred: false,
    workerSelected: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}
function flagsAreFalse(source: RecordValue): boolean {
  return (
    source.workerSelected === false &&
    source.commandDispatched === false &&
    source.dispatchRequested !== true &&
    source.dispatchOccurred === false &&
    source.delegationOccurred === false &&
    source.providerInvoked === false &&
    source.forgeInvoked === false &&
    source.executionStarted === false
  );
}
/** Purely prepares a future dispatch-port request; it never crosses the port. */
export function prepareAutomationOrchestratorWorkerDispatchRequest(
  command: AutomationOrchestratorWorkerCommand,
): AutomationOrchestratorWorkerDispatchRequest {
  const source: unknown = command;
  if (!record(source) || !flagsAreFalse(source))
    return request("rejected", "invalid_command", null);
  const values = identifiers(source);
  if (values === null) return request("rejected", "invalid_command", null);
  if (
    source.status === "prepared" &&
    source.prepared === true &&
    source.reason === "handoff_prepared" &&
    source.kind === "execute_delegated_task" &&
    typeof values.requestId === "string" &&
    typeof values.delegationId === "string" &&
    typeof values.candidateId === "string" &&
    typeof values.targetId === "string"
  )
    return request("prepared", "command_prepared", values);
  if (
    source.status === "rejected" &&
    source.prepared === false &&
    source.reason === "handoff_rejected" &&
    source.kind === null
  )
    return request("rejected", "command_rejected", values);
  return request("rejected", "invalid_command", null);
}

import type {
  AutomationOrchestratorWorkerExecutionStartPort,
  AutomationOrchestratorWorkerExecutionStartPortResult,
} from "./worker-execution-start-port-types.js";
import type { AutomationOrchestratorWorkerExecutionStartRequest } from "./worker-execution-start-request-preparation-types.js";
import type { AutomationOrchestratorWorkerExecutionStartInvocationResult } from "./worker-execution-start-invocation-types.js";
type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;
function ids(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const source = value as Record<string, unknown>;
  if (
    [
      source.requestId,
      source.delegationId,
      source.candidateId,
      source.targetId,
    ].some((x) => typeof x !== "string")
  )
    return null;
  return Object.freeze({
    requestId: source.requestId as string,
    delegationId: source.delegationId as string,
    candidateId: source.candidateId as string,
    targetId: source.targetId as string,
  });
}
function result(
  status: AutomationOrchestratorWorkerExecutionStartInvocationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionStartInvocationResult["reason"],
  attempted: boolean,
  values: Ids | null,
  requested: boolean,
): AutomationOrchestratorWorkerExecutionStartInvocationResult {
  return Object.freeze({
    status,
    reason,
    requestId: values?.requestId ?? null,
    delegationId: values?.delegationId ?? null,
    candidateId: values?.candidateId ?? null,
    targetId: values?.targetId ?? null,
    startAttempted: attempted,
    startRequested: requested,
    executionStarted: false,
  });
}
function validRequest(request: unknown): Ids | null {
  const values = ids(request);
  return values !== null &&
    (request as Record<string, unknown>).executionStarted === false
    ? values
    : null;
}
function normalize(
  value: unknown,
  expected: Ids,
): AutomationOrchestratorWorkerExecutionStartInvocationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result("start_rejected", "invalid_port_result", true, null, false);
  const source = value as Record<string, unknown>;
  const values = ids(source);
  if (
    values === null ||
    values.requestId !== expected.requestId ||
    values.delegationId !== expected.delegationId ||
    values.candidateId !== expected.candidateId ||
    values.targetId !== expected.targetId ||
    typeof source.startRequested !== "boolean" ||
    source.executionStarted !== false
  )
    return result("start_rejected", "invalid_port_result", true, null, false);
  if (
    source.status === "accepted" &&
    source.reason === "adapter_accepted" &&
    source.startRequested === true
  )
    return result("start_accepted", "port_accepted", true, values, true);
  if (
    source.status === "rejected" &&
    source.reason === "adapter_rejected" &&
    source.startRequested === false
  )
    return result("start_rejected", "port_rejected", true, values, false);
  if (
    source.status === "indeterminate" &&
    source.reason === "adapter_indeterminate"
  )
    return result(
      "start_indeterminate",
      "port_indeterminate",
      true,
      values,
      source.startRequested,
    );
  return result("start_rejected", "invalid_port_result", true, null, false);
}
/** The only V21.2 boundary permitted to call the injected start port. */
export async function invokeAutomationOrchestratorWorkerExecutionStart(
  request: AutomationOrchestratorWorkerExecutionStartRequest,
  port: AutomationOrchestratorWorkerExecutionStartPort,
): Promise<AutomationOrchestratorWorkerExecutionStartInvocationResult> {
  const expected = validRequest(request);
  if (expected === null)
    return result("start_rejected", "request_invalid", false, null, false);
  if (
    typeof port !== "object" ||
    port === null ||
    typeof (port as { start?: unknown }).start !== "function"
  )
    return result("start_rejected", "port_failed", false, null, false);
  try {
    const value: AutomationOrchestratorWorkerExecutionStartPortResult =
      await port.start(request);
    return normalize(value, expected);
  } catch {
    return result("start_rejected", "port_failed", true, null, false);
  }
}

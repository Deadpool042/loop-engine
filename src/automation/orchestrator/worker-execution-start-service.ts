import { invokeAutomationOrchestratorWorkerExecutionStart } from "./worker-execution-start-invocation.js";
import type { AutomationOrchestratorWorkerExecutionStartPort } from "./worker-execution-start-port-types.js";
import { prepareAutomationOrchestratorWorkerExecutionStartRequest } from "./worker-execution-start-request-preparation.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleInitializationResult } from "./worker-execution-lifecycle-initialization-types.js";
import type { AutomationOrchestratorWorkerExecutionStartServiceResult } from "./worker-execution-start-service-types.js";
type Ids = Readonly<{
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
}>;
function result(
  status: AutomationOrchestratorWorkerExecutionStartServiceResult["status"],
  reason: AutomationOrchestratorWorkerExecutionStartServiceResult["reason"],
  prepared: boolean,
  attempted: boolean,
  ids: Ids | null,
): AutomationOrchestratorWorkerExecutionStartServiceResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    requestPrepared: prepared,
    startAttempted: attempted,
    executionStarted: false,
  });
}
export async function dispatchAutomationOrchestratorWorkerExecutionStart(
  input: AutomationOrchestratorWorkerExecutionLifecycleInitializationResult,
  port: AutomationOrchestratorWorkerExecutionStartPort,
): Promise<AutomationOrchestratorWorkerExecutionStartServiceResult> {
  const prepared =
    prepareAutomationOrchestratorWorkerExecutionStartRequest(input);
  if (prepared.status === "request_rejected")
    return result(
      "start_request_rejected",
      "request_rejected",
      false,
      false,
      null,
    );
  if (prepared.status !== "request_prepared" || prepared.request === null)
    return result(
      "start_request_indeterminate",
      "request_indeterminate",
      false,
      false,
      null,
    );
  const invocation = await invokeAutomationOrchestratorWorkerExecutionStart(
    prepared.request,
    port,
  );
  if (invocation.status === "start_accepted")
    return result(
      "start_accepted",
      "port_accepted",
      true,
      invocation.startAttempted,
      invocation,
    );
  if (invocation.status === "start_indeterminate")
    return result(
      "start_indeterminate",
      "port_indeterminate",
      true,
      invocation.startAttempted,
      invocation,
    );
  return result(
    "start_rejected",
    invocation.reason,
    true,
    invocation.startAttempted,
    invocation.reason === "port_rejected" ? invocation : null,
  );
}

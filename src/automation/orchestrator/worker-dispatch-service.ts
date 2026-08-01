import { invokeAutomationOrchestratorWorkerDispatch } from "./worker-dispatch-invocation.js";
import { prepareAutomationOrchestratorWorkerDispatchRequest } from "./worker-dispatch-port.js";
import type { AutomationOrchestratorWorkerDispatchPort } from "./worker-dispatch-port-types.js";
import type { AutomationOrchestratorWorkerDispatchServiceResult } from "./worker-dispatch-service-types.js";
import type { AutomationOrchestratorWorkerCommand } from "./worker-command-types.js";

type Identifiers = Readonly<{
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
}>;

function result(
  status: AutomationOrchestratorWorkerDispatchServiceResult["status"],
  reason: AutomationOrchestratorWorkerDispatchServiceResult["reason"],
  requestPrepared: boolean,
  dispatchAttempted: boolean,
  identifiers: Identifiers | null,
  flags: Readonly<{
    dispatchOccurred: boolean;
    workerSelected: boolean;
    providerInvoked: boolean;
    forgeInvoked: boolean;
    executionStarted: boolean;
  }> | null,
): AutomationOrchestratorWorkerDispatchServiceResult {
  return Object.freeze({
    status,
    reason,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    requestPrepared,
    dispatchAttempted,
    dispatchOccurred: flags?.dispatchOccurred ?? false,
    workerSelected: flags?.workerSelected ?? false,
    providerInvoked: flags?.providerInvoked ?? false,
    forgeInvoked: flags?.forgeInvoked ?? false,
    executionStarted: flags?.executionStarted ?? false,
  });
}

/** Composes the V20.7 preparation and V20.8 invocation boundaries. */
export async function dispatchAutomationOrchestratorWorkerCommand(
  command: AutomationOrchestratorWorkerCommand,
  port: AutomationOrchestratorWorkerDispatchPort,
): Promise<AutomationOrchestratorWorkerDispatchServiceResult> {
  const request = prepareAutomationOrchestratorWorkerDispatchRequest(command);
  if (
    request.status !== "prepared" ||
    request.prepared !== true ||
    request.reason !== "command_prepared"
  ) {
    if (request.reason === "command_rejected")
      return result(
        "rejected",
        "command_rejected",
        false,
        false,
        request,
        null,
      );
    return result("rejected", "invalid_command", false, false, null, null);
  }

  const invocation = await invokeAutomationOrchestratorWorkerDispatch(
    request,
    port,
  );
  if (invocation.reason === "port_accepted")
    return result(
      "accepted",
      "dispatch_accepted",
      true,
      invocation.dispatchAttempted,
      invocation,
      invocation,
    );
  if (invocation.reason === "port_rejected")
    return result(
      "rejected",
      "dispatch_rejected",
      true,
      invocation.dispatchAttempted,
      invocation,
      invocation,
    );
  if (invocation.reason === "port_indeterminate")
    return result(
      "indeterminate",
      "dispatch_indeterminate",
      true,
      invocation.dispatchAttempted,
      invocation,
      invocation,
    );
  if (invocation.reason === "port_failed")
    return result(
      "indeterminate",
      "port_failed",
      true,
      invocation.dispatchAttempted,
      null,
      null,
    );
  return result(
    "indeterminate",
    "invalid_port_result",
    true,
    invocation.dispatchAttempted,
    null,
    null,
  );
}

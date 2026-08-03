import type {
  AutomationOrchestratorWorkerExecutionLifecycleClosurePort,
  AutomationOrchestratorWorkerExecutionLifecycleClosurePortResult,
} from "./worker-execution-lifecycle-closure-port-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult } from "./worker-execution-lifecycle-closure-preparation-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult } from "./worker-execution-lifecycle-closure-invocation-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function identifiers(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const source = value as Record<string, unknown>;
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

function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult["reason"],
  attempted: boolean,
  ids: Ids | null,
  requested: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    closureAttempted: attempted,
    closureRequested: requested,
    lifecycleClosed: false,
  });
}

function validRequest(
  request: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult,
): Ids | null {
  const ids = identifiers(request);
  return ids !== null &&
    request.status === "closure_ready" &&
    (request.reason === "completed_lifecycle" ||
      request.reason === "failed_lifecycle") &&
    request.executionStarted === true &&
    request.executionFinished === true &&
    request.lifecycleFinalized === true &&
    request.closureRequired === true
    ? ids
    : null;
}

function normalize(
  value: unknown,
  expected: Ids,
): AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result("closure_rejected", "invalid_port_result", true, null, false);
  const source = value as Record<string, unknown>;
  const ids = identifiers(source);
  if (
    ids === null ||
    ids.requestId !== expected.requestId ||
    ids.delegationId !== expected.delegationId ||
    ids.candidateId !== expected.candidateId ||
    ids.targetId !== expected.targetId ||
    typeof source.closureRequested !== "boolean" ||
    source.lifecycleClosed !== false
  )
    return result("closure_rejected", "invalid_port_result", true, null, false);
  if (
    source.status === "accepted" &&
    source.reason === "adapter_accepted" &&
    source.closureRequested === true
  )
    return result("closure_accepted", "port_accepted", true, ids, true);
  if (
    source.status === "rejected" &&
    source.reason === "adapter_rejected" &&
    source.closureRequested === false
  )
    return result("closure_rejected", "port_rejected", true, ids, false);
  if (
    source.status === "indeterminate" &&
    source.reason === "adapter_indeterminate"
  )
    return result(
      "closure_indeterminate",
      "port_indeterminate",
      true,
      ids,
      source.closureRequested,
    );
  return result("closure_rejected", "invalid_port_result", true, null, false);
}

/** The only V21.10 boundary permitted to call the injected lifecycle closure port. */
export async function invokeAutomationOrchestratorWorkerExecutionLifecycleClosure(
  request: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult,
  port: AutomationOrchestratorWorkerExecutionLifecycleClosurePort,
): Promise<AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult> {
  const expected = validRequest(request);
  if (expected === null)
    return result("closure_rejected", "request_invalid", false, null, false);
  if (
    typeof port !== "object" ||
    port === null ||
    typeof (port as { close?: unknown }).close !== "function"
  )
    return result("closure_rejected", "port_failed", false, null, false);
  try {
    const value: AutomationOrchestratorWorkerExecutionLifecycleClosurePortResult =
      await port.close(request);
    return normalize(value, expected);
  } catch {
    return result("closure_rejected", "port_failed", true, null, false);
  }
}

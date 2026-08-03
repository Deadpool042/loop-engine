import type { AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult } from "./worker-execution-lifecycle-closed-transition-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult } from "./worker-execution-lifecycle-terminal-state-types.js";

type Ids = Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string;
  targetId: string;
}>;

function identifiers(value: unknown): Ids | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  if (
    typeof source.requestId !== "string" ||
    typeof source.delegationId !== "string" ||
    typeof source.candidateId !== "string" ||
    typeof source.targetId !== "string"
  ) {
    return null;
  }

  return Object.freeze({
    requestId: source.requestId,
    delegationId: source.delegationId,
    candidateId: source.candidateId,
    targetId: source.targetId,
  });
}

function result(
  status: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult["reason"],
  ids: Ids | null,
  terminal: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult {
  return Object.freeze({
    status,
    reason,
    requestId: ids?.requestId ?? null,
    delegationId: ids?.delegationId ?? null,
    candidateId: ids?.candidateId ?? null,
    targetId: ids?.targetId ?? null,
    executionStarted: ids !== null,
    executionFinished: ids !== null,
    lifecycleFinalized: ids !== null,
    lifecycleClosed: terminal,
    terminal,
  });
}

/** Pure V21.13 terminal-state qualification from a V21.12 transition. */
export function qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
  transition: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult {
  const ids = identifiers(transition);

  if (
    ids !== null &&
    transition.status === "lifecycle_closed" &&
    transition.reason === "closure_confirmed" &&
    transition.executionStarted === true &&
    transition.executionFinished === true &&
    transition.lifecycleFinalized === true &&
    transition.lifecycleClosed === true
  ) {
    return result("lifecycle_terminal", "closure_confirmed", ids, true);
  }

  if (
    ids !== null &&
    transition.status === "lifecycle_not_closed" &&
    transition.reason === "closure_rejected" &&
    transition.executionStarted === true &&
    transition.executionFinished === true &&
    transition.lifecycleFinalized === true &&
    transition.lifecycleClosed === false
  ) {
    return result("lifecycle_non_terminal", "closure_rejected", ids, false);
  }

  if (
    ids !== null &&
    transition.status === "lifecycle_indeterminate" &&
    transition.reason === "closure_indeterminate" &&
    transition.executionStarted === true &&
    transition.executionFinished === true &&
    transition.lifecycleFinalized === true &&
    transition.lifecycleClosed === false
  ) {
    return result("lifecycle_indeterminate", "closure_indeterminate", ids, false);
  }

  return result("terminal_state_rejected", "invalid_transition", null, false);
}

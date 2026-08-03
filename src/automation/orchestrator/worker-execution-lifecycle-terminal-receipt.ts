import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult } from "./worker-execution-lifecycle-terminal-state-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult } from "./worker-execution-lifecycle-terminal-receipt-types.js";

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
  status: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult["status"],
  reason: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult["reason"],
  ids: Ids | null,
  terminal: boolean,
  confirmed: boolean,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult {
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
    terminalConfirmed: confirmed,
  });
}

/** Pure V21.14 validation from a qualified terminal-state result. */
export function validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt(
  terminalState: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult,
): AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult {
  const ids = identifiers(terminalState);

  if (
    ids !== null &&
    terminalState.status === "lifecycle_terminal" &&
    terminalState.reason === "closure_confirmed" &&
    terminalState.executionStarted === true &&
    terminalState.executionFinished === true &&
    terminalState.lifecycleFinalized === true &&
    terminalState.lifecycleClosed === true &&
    terminalState.terminal === true
  ) {
    return result("terminal_confirmed", "terminal_state_confirmed", ids, true, true);
  }

  if (
    ids !== null &&
    terminalState.status === "lifecycle_non_terminal" &&
    terminalState.reason === "closure_rejected" &&
    terminalState.executionStarted === true &&
    terminalState.executionFinished === true &&
    terminalState.lifecycleFinalized === true &&
    terminalState.lifecycleClosed === false &&
    terminalState.terminal === false
  ) {
    return result("terminal_rejected", "terminal_state_rejected", ids, false, false);
  }

  if (
    ids !== null &&
    terminalState.status === "lifecycle_indeterminate" &&
    terminalState.reason === "closure_indeterminate" &&
    terminalState.executionStarted === true &&
    terminalState.executionFinished === true &&
    terminalState.lifecycleFinalized === true &&
    terminalState.lifecycleClosed === false &&
    terminalState.terminal === false
  ) {
    return result(
      "terminal_indeterminate",
      "terminal_state_indeterminate",
      ids,
      false,
      false,
    );
  }

  return result("terminal_rejected", "invalid_terminal_state", null, false, false);
}

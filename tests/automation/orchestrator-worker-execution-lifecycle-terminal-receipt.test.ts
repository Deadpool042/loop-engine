import assert from "node:assert/strict";
import test from "node:test";

import { validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-receipt.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-state-types.js";

const terminalState: AutomationOrchestratorWorkerExecutionLifecycleTerminalStateResult =
  Object.freeze({
    status: "lifecycle_terminal",
    reason: "closure_confirmed",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    executionStarted: true,
    executionFinished: true,
    lifecycleFinalized: true,
    lifecycleClosed: true,
    terminal: true,
  });

test("V21.14 confirms a coherent terminal state", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt(
      terminalState,
    ),
    {
      status: "terminal_confirmed",
      reason: "terminal_state_confirmed",
      requestId: "request-1",
      delegationId: "delegation-1",
      candidateId: "candidate-1",
      targetId: "target-1",
      executionStarted: true,
      executionFinished: true,
      lifecycleFinalized: true,
      lifecycleClosed: true,
      terminal: true,
      terminalConfirmed: true,
    },
  );
});

test("V21.14 preserves coherent rejected and indeterminate states", () => {
  assert.equal(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt(
      Object.freeze({
        ...terminalState,
        status: "lifecycle_non_terminal",
        reason: "closure_rejected",
        lifecycleClosed: false,
        terminal: false,
      }),
    ).status,
    "terminal_rejected",
  );

  assert.equal(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt(
      Object.freeze({
        ...terminalState,
        status: "lifecycle_indeterminate",
        reason: "closure_indeterminate",
        lifecycleClosed: false,
        terminal: false,
      }),
    ).status,
    "terminal_indeterminate",
  );
});

test("V21.14 rejects incoherent terminal states fail-closed", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalReceipt(
      Object.freeze({ ...terminalState, terminal: false }),
    ),
    {
      status: "terminal_rejected",
      reason: "invalid_terminal_state",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      executionStarted: false,
      executionFinished: false,
      lifecycleFinalized: false,
      lifecycleClosed: false,
      terminal: false,
      terminalConfirmed: false,
    },
  );
});

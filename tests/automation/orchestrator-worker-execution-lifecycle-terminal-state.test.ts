import assert from "node:assert/strict";
import test from "node:test";

import { qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-state.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-closed-transition-types.js";

const closed: AutomationOrchestratorWorkerExecutionLifecycleClosedTransitionResult =
  Object.freeze({
    status: "lifecycle_closed",
    reason: "closure_confirmed",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    executionStarted: true,
    executionFinished: true,
    lifecycleFinalized: true,
    lifecycleClosed: true,
  });

test("V21.13 qualifies a closed lifecycle as terminal", () => {
  assert.deepEqual(
    qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState(closed),
    {
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
    },
  );
});

test("V21.13 preserves coherent non-terminal and indeterminate states", () => {
  assert.equal(
    qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
      Object.freeze({
        ...closed,
        status: "lifecycle_not_closed",
        reason: "closure_rejected",
        lifecycleClosed: false,
      }),
    ).status,
    "lifecycle_non_terminal",
  );

  assert.equal(
    qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
      Object.freeze({
        ...closed,
        status: "lifecycle_indeterminate",
        reason: "closure_indeterminate",
        lifecycleClosed: false,
      }),
    ).status,
    "lifecycle_indeterminate",
  );
});

test("V21.13 rejects incoherent transitions fail-closed", () => {
  assert.deepEqual(
    qualifyAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
      Object.freeze({ ...closed, lifecycleClosed: false }),
    ),
    {
      status: "terminal_state_rejected",
      reason: "invalid_transition",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      executionStarted: false,
      executionFinished: false,
      lifecycleFinalized: false,
      lifecycleClosed: false,
      terminal: false,
    },
  );
});

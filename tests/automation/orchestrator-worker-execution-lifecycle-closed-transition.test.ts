import assert from "node:assert/strict";
import test from "node:test";

import { transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed } from "../../src/automation/orchestrator/worker-execution-lifecycle-closed-transition.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-receipt-types.js";

const confirmed: AutomationOrchestratorWorkerExecutionLifecycleClosureReceiptValidationResult =
  Object.freeze({
    status: "closure_confirmed",
    reason: "closure_accepted",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    closureAttempted: true,
    closureRequested: true,
    lifecycleClosed: true,
  });

test("V21.12 transitions a confirmed receipt to lifecycle_closed", () => {
  assert.deepEqual(
    transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed(confirmed),
    {
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
    },
  );
});

test("V21.12 preserves coherent rejection and indeterminate states", () => {
  assert.equal(
    transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed(
      Object.freeze({
        ...confirmed,
        status: "closure_rejected",
        reason: "closure_rejected",
        closureRequested: false,
        lifecycleClosed: false,
      }),
    ).status,
    "lifecycle_not_closed",
  );

  assert.equal(
    transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed(
      Object.freeze({
        ...confirmed,
        status: "closure_indeterminate",
        reason: "closure_indeterminate",
        closureRequested: false,
        lifecycleClosed: false,
      }),
    ).status,
    "lifecycle_indeterminate",
  );
});

test("V21.12 rejects incoherent receipts fail-closed", () => {
  assert.deepEqual(
    transitionAutomationOrchestratorWorkerExecutionLifecycleToClosed(
      Object.freeze({ ...confirmed, lifecycleClosed: false }),
    ),
    {
      status: "transition_rejected",
      reason: "invalid_receipt",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      executionStarted: false,
      executionFinished: false,
      lifecycleFinalized: false,
      lifecycleClosed: false,
    },
  );
});

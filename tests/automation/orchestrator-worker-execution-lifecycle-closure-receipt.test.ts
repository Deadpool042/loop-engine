import assert from "node:assert/strict";
import test from "node:test";

import { validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-receipt.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-invocation-types.js";

const accepted: AutomationOrchestratorWorkerExecutionLifecycleClosureInvocationResult =
  Object.freeze({
    status: "closure_accepted",
    reason: "port_accepted",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    closureAttempted: true,
    closureRequested: true,
    lifecycleClosed: false,
  });

test("V21.11 confirms an accepted closure receipt", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt(accepted),
    {
      status: "closure_confirmed",
      reason: "closure_accepted",
      requestId: "request-1",
      delegationId: "delegation-1",
      candidateId: "candidate-1",
      targetId: "target-1",
      closureAttempted: true,
      closureRequested: true,
      lifecycleClosed: true,
    },
  );
});

test("V21.11 preserves a coherent rejection without closing the lifecycle", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt(
      Object.freeze({
        ...accepted,
        status: "closure_rejected",
        reason: "port_rejected",
        closureRequested: false,
      }),
    ),
    {
      status: "closure_rejected",
      reason: "closure_rejected",
      requestId: "request-1",
      delegationId: "delegation-1",
      candidateId: "candidate-1",
      targetId: "target-1",
      closureAttempted: true,
      closureRequested: false,
      lifecycleClosed: false,
    },
  );
});

test("V21.11 preserves a coherent indeterminate receipt", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt(
      Object.freeze({
        ...accepted,
        status: "closure_indeterminate",
        reason: "port_indeterminate",
        closureRequested: false,
      }),
    ),
    {
      status: "closure_indeterminate",
      reason: "closure_indeterminate",
      requestId: "request-1",
      delegationId: "delegation-1",
      candidateId: "candidate-1",
      targetId: "target-1",
      closureAttempted: true,
      closureRequested: false,
      lifecycleClosed: false,
    },
  );
});

test("V21.11 rejects an incoherent invocation without propagating identifiers", () => {
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleClosureReceipt(
      Object.freeze({ ...accepted, closureAttempted: false }),
    ),
    {
      status: "closure_rejected",
      reason: "invalid_invocation",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      closureAttempted: false,
      closureRequested: false,
      lifecycleClosed: false,
    },
  );
});

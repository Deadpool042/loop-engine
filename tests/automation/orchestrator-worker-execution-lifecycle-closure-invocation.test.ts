import assert from "node:assert/strict";
import test from "node:test";

import { invokeAutomationOrchestratorWorkerExecutionLifecycleClosure } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-invocation.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosurePort } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-port-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-closure-preparation-types.js";

const request: AutomationOrchestratorWorkerExecutionLifecycleClosurePreparationResult =
  Object.freeze({
    status: "closure_ready",
    reason: "completed_lifecycle",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    executionStarted: true,
    executionFinished: true,
    executionSucceeded: true,
    lifecycleFinalized: true,
    closureRequired: true,
  });

test("V21.10 invokes the injected closure port exactly once", async () => {
  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleClosurePort = {
    async close(value) {
      calls += 1;
      assert.equal(value, request);
      return Object.freeze({
        status: "accepted",
        reason: "adapter_accepted",
        requestId: value.requestId as string,
        delegationId: value.delegationId as string,
        candidateId: value.candidateId as string,
        targetId: value.targetId as string,
        closureRequested: true,
        lifecycleClosed: false,
      });
    },
  };

  assert.deepEqual(
    await invokeAutomationOrchestratorWorkerExecutionLifecycleClosure(
      request,
      port,
    ),
    {
      status: "closure_accepted",
      reason: "port_accepted",
      requestId: "request-1",
      delegationId: "delegation-1",
      candidateId: "candidate-1",
      targetId: "target-1",
      closureAttempted: true,
      closureRequested: true,
      lifecycleClosed: false,
    },
  );
  assert.equal(calls, 1);
});

test("V21.10 rejects invalid closure input without calling the port", async () => {
  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleClosurePort = {
    async close() {
      calls += 1;
      throw new Error("must not be called");
    },
  };
  const invalid = Object.freeze({ ...request, closureRequired: false });

  assert.deepEqual(
    await invokeAutomationOrchestratorWorkerExecutionLifecycleClosure(
      invalid,
      port,
    ),
    {
      status: "closure_rejected",
      reason: "request_invalid",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      closureAttempted: false,
      closureRequested: false,
      lifecycleClosed: false,
    },
  );
  assert.equal(calls, 0);
});

test("V21.10 normalizes port failures fail-closed", async () => {
  const port: AutomationOrchestratorWorkerExecutionLifecycleClosurePort = {
    async close() {
      throw new Error("failure");
    },
  };

  assert.deepEqual(
    await invokeAutomationOrchestratorWorkerExecutionLifecycleClosure(
      request,
      port,
    ),
    {
      status: "closure_rejected",
      reason: "port_failed",
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
      closureAttempted: true,
      closureRequested: false,
      lifecycleClosed: false,
    },
  );
});

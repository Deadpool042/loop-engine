import assert from "node:assert/strict";
import test from "node:test";

import {
  invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication,
  prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
  validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt,
} from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-publication.js";
import type {
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort,
  AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
} from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-publication-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-receipt-types.js";

const terminalReceipt: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult =
  Object.freeze({
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
  });

const expectedRequest = Object.freeze({
  requestId: "request-1",
  delegationId: "delegation-1",
  candidateId: "candidate-1",
  targetId: "target-1",
});

test("V22.0 prepares, publishes and confirms a terminal lifecycle", async () => {
  assert.deepEqual(
    prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest(
      terminalReceipt,
    ),
    expectedRequest,
  );

  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort = {
    async publish(request) {
      calls += 1;
      assert.equal(request, request);
      return Object.freeze({ status: "accepted", ...request });
    },
  };

  const invocation =
    await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
      expectedRequest,
      port,
    );

  assert.equal(calls, 1);
  assert.equal(invocation.status, "publication_accepted");
  assert.equal(invocation.terminalPublished, true);
  assert.deepEqual(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt(
      invocation,
    ),
    {
      status: "publication_confirmed",
      reason: "publication_accepted",
      ...expectedRequest,
      publicationAttempted: true,
      terminalPublished: true,
      terminalPublicationConfirmed: true,
    },
  );
});

test("V22.0 rejects invalid preparation and never calls the port", async () => {
  assert.equal(
    prepareAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest(
      Object.freeze({ ...terminalReceipt, terminalConfirmed: false }),
    ),
    null,
  );

  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort = {
    publish(request) {
      calls += 1;
      return Object.freeze({ status: "accepted", ...request });
    },
  };

  const result =
    await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
      null as unknown as AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationRequest,
      port,
    );
  assert.equal(calls, 0);
  assert.equal(result.reason, "invalid_request");
});

test("V22.0 normalizes rejection, indeterminate, failure and incoherent port results", async () => {
  for (const status of ["rejected", "indeterminate"] as const) {
    const result =
      await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
        expectedRequest,
        { publish: async (request) => Object.freeze({ status, ...request }) },
      );
    assert.equal(
      result.status,
      status === "rejected" ? "publication_rejected" : "publication_indeterminate",
    );
    assert.equal(result.terminalPublished, false);
  }

  const failed =
    await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
      expectedRequest,
      { publish: async () => { throw new Error("boom"); } },
    );
  assert.equal(failed.reason, "port_failed");

  const incoherent =
    await invokeAutomationOrchestratorWorkerExecutionLifecycleTerminalPublication(
      expectedRequest,
      {
        publish: async (request) =>
          Object.freeze({ ...request, status: "accepted", targetId: "other" }),
      },
    );
  assert.equal(incoherent.reason, "invalid_port_result");

  assert.equal(
    validateAutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationReceipt(
      Object.freeze({ ...incoherent, publicationAttempted: false }),
    ).reason,
    "invalid_invocation",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { publishAutomationOrchestratorWorkerExecutionLifecycleTerminalState } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-publication-service.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-publication-types.js";
import type { AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult } from "../../src/automation/orchestrator/worker-execution-lifecycle-terminal-receipt-types.js";

const receipt: AutomationOrchestratorWorkerExecutionLifecycleTerminalReceiptValidationResult =
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

test("V22.1 publishes and confirms a valid terminal receipt with one port call", async () => {
  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort = {
    publish(request) {
      calls += 1;
      return Object.freeze({ status: "accepted", ...request });
    },
  };

  const result =
    await publishAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
      receipt,
      port,
    );

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    status: "publication_confirmed",
    reason: "publication_accepted",
    requestId: "request-1",
    delegationId: "delegation-1",
    candidateId: "candidate-1",
    targetId: "target-1",
    publicationAttempted: true,
    terminalPublished: true,
    terminalPublicationConfirmed: true,
  });
});

test("V22.1 rejects an invalid terminal receipt without calling the port", async () => {
  let calls = 0;
  const port: AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort = {
    publish(request) {
      calls += 1;
      return Object.freeze({ status: "accepted", ...request });
    },
  };

  const result =
    await publishAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
      Object.freeze({ ...receipt, terminalConfirmed: false }),
      port,
    );

  assert.equal(calls, 0);
  assert.deepEqual(result, {
    status: "publication_rejected",
    reason: "invalid_invocation",
    requestId: null,
    delegationId: null,
    candidateId: null,
    targetId: null,
    publicationAttempted: false,
    terminalPublished: false,
    terminalPublicationConfirmed: false,
  });
});

test("V22.1 normalizes rejected, indeterminate, failed and incoherent publication", async () => {
  const cases = [
    {
      port: {
        publish: (request: Parameters<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort["publish"]>[0]) =>
          Object.freeze({ status: "rejected" as const, ...request }),
      },
      status: "publication_rejected",
      reason: "publication_rejected",
    },
    {
      port: {
        publish: (request: Parameters<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort["publish"]>[0]) =>
          Object.freeze({ status: "indeterminate" as const, ...request }),
      },
      status: "publication_indeterminate",
      reason: "publication_indeterminate",
    },
    {
      port: {
        publish: async () => {
          throw new Error("publication failed");
        },
      },
      status: "publication_indeterminate",
      reason: "publication_indeterminate",
    },
    {
      port: {
        publish: (request: Parameters<AutomationOrchestratorWorkerExecutionLifecycleTerminalPublicationPort["publish"]>[0]) =>
          Object.freeze({ status: "accepted" as const, ...request, targetId: "other" }),
      },
      status: "publication_indeterminate",
      reason: "publication_indeterminate",
    },
  ] as const;

  for (const entry of cases) {
    const result =
      await publishAutomationOrchestratorWorkerExecutionLifecycleTerminalState(
        receipt,
        entry.port,
      );
    assert.equal(result.status, entry.status);
    assert.equal(result.reason, entry.reason);
    assert.equal(result.terminalPublicationConfirmed, false);
  }
});

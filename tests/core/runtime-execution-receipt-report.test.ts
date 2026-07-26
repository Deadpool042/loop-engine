import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRuntimeExecutionReceiptReport,
  RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION,
  serializeRuntimeExecutionReceiptReport,
  type RuntimeExecutionReceipt,
} from "../../src/core/index.js";

function receiptFixture(): RuntimeExecutionReceipt {
  return Object.freeze({
    schemaVersion: 1,
    descriptorId: "runtime-a",
    runtimeId: "custom",
    request: {
      task: { id: "task-1", title: "report receipt" },
      mode: "execute",
      provider: "openai",
      effort: "low",
      requestedAt: "2026-01-01T00:00:00.000Z",
      requestedRuntime: "custom",
      allowedProviders: ["openai"],
      allowedRuntimes: ["custom"],
      contextPackage: { files: [], instructions: [], metadata: {} },
      metadata: {},
      localProcessConfigured: false,
    },
    capabilityDecision: {
      outcome: "selected",
      descriptorId: "runtime-a",
      compatibleRuntimeIds: ["runtime-a"],
      evaluatedRuntimeIds: ["runtime-a"],
      requirements: [],
    },
    policyDecision: {
      outcome: "admitted",
      policyId: "policy-1",
      mode: "execute",
      status: "resolved",
      checks: [],
      diagnosticCodes: [],
    },
    executionConstraints: {
      provider: "openai",
      effort: "low",
      requestedBudget: null,
      limitBudget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: null,
        maxCalls: null,
        maxRepairs: null,
      },
      mergedBudget: null,
      allowedProviders: ["openai"],
      allowedRuntimes: ["custom"],
    },
    reasons: {
      selectionCodes: [],
      admissionCodes: [],
    },
    outcome: {
      status: "completed",
      output: { accepted: true },
      diagnostics: [],
      errorCode: null,
      errorMessage: null,
    },
  }) as unknown as RuntimeExecutionReceipt;
}

test("creates an additive versioned report envelope without cloning the receipt", () => {
  const receipt = receiptFixture();
  const report = createRuntimeExecutionReceiptReport(receipt);

  assert.equal(report.schemaVersion, RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION);
  assert.equal(report.receipt, receipt);
  assert.ok(Object.isFrozen(report));
});

test("serializes the receipt report deterministically as JSON", () => {
  const receipt = receiptFixture();
  const report = createRuntimeExecutionReceiptReport(receipt);
  const serialized = serializeRuntimeExecutionReceiptReport(report);

  assert.equal(serialized, JSON.stringify({ schemaVersion: 1, receipt }));
  assert.deepEqual(JSON.parse(serialized), { schemaVersion: 1, receipt });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  attachRuntimeExecutionReceiptReport,
  type PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult,
  type RuntimeExecutionReceipt,
} from "../../src/core/index.js";

function receiptFixture(): RuntimeExecutionReceipt {
  return Object.freeze({
    schemaVersion: 1,
    descriptorId: "runtime-a",
    runtimeId: "custom",
    request: {
      task: { id: "task-1", title: "integrated receipt report" },
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
    reasons: { selectionCodes: [], admissionCodes: [] },
    outcome: {
      status: "completed",
      output: { accepted: true },
      diagnostics: [],
      errorCode: null,
      errorMessage: null,
    },
  }) as unknown as RuntimeExecutionReceipt;
}

test("attaches a report only to an executed receipt result", () => {
  const receipt = receiptFixture();
  const result = Object.freeze({
    outcome: "executed",
    resolution: {},
    runtimeResult: {},
    receipt,
    diagnostics: [],
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;

  const integrated = attachRuntimeExecutionReceiptReport(result);

  assert.equal(integrated.outcome, "executed");
  assert.equal(integrated.report.receipt, receipt);
  assert.equal(integrated.report.schemaVersion, 1);
  assert.ok(Object.isFrozen(integrated));
});

test("keeps report null when execution produced no receipt", () => {
  const result = Object.freeze({
    outcome: "resolution_failed",
    resolution: {},
    runtimeResult: null,
    receipt: null,
    diagnostics: [],
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;

  const integrated = attachRuntimeExecutionReceiptReport(result);

  assert.equal(integrated.outcome, "resolution_failed");
  assert.equal(integrated.report, null);
  assert.equal(integrated.receipt, null);
});

test("integration stays outside historical execution reporting", () => {
  const source = readFileSync(
    "src/core/runtime-execution-receipt-reporting-integration.ts",
    "utf8",
  );
  const historicalReport = readFileSync("src/execution/report.ts", "utf8");

  assert.match(source, /executePolicyAwareDeclarativeRuntimeWithReceipt\(input\)/);
  assert.match(source, /createRuntimeExecutionReceiptReport\(result\.receipt\)/);
  assert.doesNotMatch(source, /src\/execution|\.\.\/execution/);
  assert.doesNotMatch(historicalReport, /RuntimeExecutionReceipt/);
});

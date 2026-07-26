import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  finalizeRuntimeExecutionPublicResult,
  type PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
  type RuntimeExecutionReceiptReport,
} from "../../src/core/index.js";

function reportFixture(): RuntimeExecutionReceiptReport {
  return Object.freeze({
    schemaVersion: 1,
    receipt: Object.freeze({
      schemaVersion: 1,
      descriptorId: "runtime-a",
      runtimeId: "custom",
      request: {
        task: { id: "task-1", title: "public facade" },
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
    }),
  }) as unknown as RuntimeExecutionReceiptReport;
}

test("finalizes an integrated execution into only public result and stable JSON", () => {
  const report = reportFixture();
  const integrated = Object.freeze({
    outcome: "executed",
    resolution: { internal: true },
    runtimeResult: { secret: "internal" },
    receipt: report.receipt,
    diagnostics: [],
    report,
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;

  const facade = finalizeRuntimeExecutionPublicResult(integrated);

  assert.deepEqual(Object.keys(facade), ["result", "serialized"]);
  assert.equal(facade.result.outcome, "executed");
  assert.equal(facade.result.report, report);
  assert.deepEqual(facade.result.diagnosticCodes, []);
  assert.equal(facade.serialized, JSON.stringify(facade.result));
  assert.equal("runtimeResult" in facade.result, false);
  assert.equal("resolution" in facade.result, false);
  assert.ok(Object.isFrozen(facade));
});

test("preserves a public failure without leaking internal diagnostic fields", () => {
  const integrated = Object.freeze({
    outcome: "resolution_failed",
    resolution: { internal: true },
    runtimeResult: null,
    receipt: null,
    diagnostics: [
      {
        code: "runtime_execution_runtime_not_allowed",
        message: "internal explanation",
        details: { secret: true },
      },
    ],
    report: null,
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;

  const facade = finalizeRuntimeExecutionPublicResult(integrated);
  const parsed = JSON.parse(facade.serialized) as Record<string, unknown>;

  assert.deepEqual(facade.result.diagnosticCodes, [
    "runtime_execution_runtime_not_allowed",
  ]);
  assert.equal(facade.result.report, null);
  assert.equal(JSON.stringify(parsed).includes("internal explanation"), false);
  assert.equal(JSON.stringify(parsed).includes("secret"), false);
});

test("facade composes the established V13.77 and V13.78 boundaries only", () => {
  const source = readFileSync(
    "src/core/runtime-execution-public-result-facade.ts",
    "utf8",
  );

  assert.match(
    source,
    /executePolicyAwareDeclarativeRuntimeWithReceiptReport\(input\)/,
  );
  assert.match(source, /projectRuntimeExecutionReceiptReportingResult\(integrated\)/);
  assert.match(source, /serializeRuntimeExecutionReceiptReportingResult\(integrated\)/);
  assert.doesNotMatch(source, /executePolicyAwareDeclarativeRuntimeWithReceipt\(input\)/);
  assert.doesNotMatch(source, /src\/execution|\.\.\/execution/);
  assert.doesNotMatch(source, /runtimeResult:/);
  assert.doesNotMatch(source, /resolution:/);
});

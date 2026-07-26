import assert from "node:assert/strict";
import { test } from "node:test";

import {
  projectRuntimeExecutionReceiptReportingResult,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION,
  serializeRuntimeExecutionReceiptReportingResult,
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
      request: Object.freeze({}),
      capabilityDecision: Object.freeze({}),
      policyDecision: Object.freeze({}),
      executionConstraints: Object.freeze({}),
      reasons: Object.freeze({ selectionCodes: [], admissionCodes: [] }),
      outcome: Object.freeze({
        status: "completed",
        output: { accepted: true },
        diagnostics: [],
        errorCode: null,
        errorMessage: null,
      }),
    } as never),
  });
}

function executedFixture(): PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult {
  const report = reportFixture();
  return Object.freeze({
    outcome: "executed",
    resolution: Object.freeze({ private: "resolution" }),
    runtimeResult: Object.freeze({ private: "runtime-result" }),
    receipt: report.receipt,
    report,
    diagnostics: [],
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;
}

test("projects the integrated result without exposing RuntimeResult or resolution", () => {
  const result = executedFixture();
  const projected = projectRuntimeExecutionReceiptReportingResult(result);

  assert.equal(
    projected.schemaVersion,
    RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION,
  );
  assert.equal(projected.outcome, "executed");
  assert.equal(projected.report, result.report);
  assert.deepEqual(projected.diagnosticCodes, []);
  assert.equal("runtimeResult" in projected, false);
  assert.equal("resolution" in projected, false);
  assert.ok(Object.isFrozen(projected));
  assert.ok(Object.isFrozen(projected.diagnosticCodes));
});

test("projects only diagnostic codes for non-executed results", () => {
  const result = Object.freeze({
    outcome: "resolution_failed",
    resolution: Object.freeze({ private: "resolution" }),
    runtimeResult: null,
    receipt: null,
    report: null,
    diagnostics: [
      Object.freeze({
        code: "runtime_execution_policy_denied",
        message: "internal diagnostic message",
        details: Object.freeze({ secret: "not-public" }),
      }),
    ],
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;

  assert.deepEqual(projectRuntimeExecutionReceiptReportingResult(result), {
    schemaVersion: 1,
    outcome: "resolution_failed",
    report: null,
    diagnosticCodes: ["runtime_execution_policy_denied"],
  });
});

test("serializes the public projection deterministically", () => {
  const result = executedFixture();
  const serialized = serializeRuntimeExecutionReceiptReportingResult(result);

  assert.equal(
    serialized,
    JSON.stringify(projectRuntimeExecutionReceiptReportingResult(result)),
  );
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal("runtimeResult" in parsed, false);
  assert.equal("resolution" in parsed, false);
});

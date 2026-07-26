import type { DeclarativeRuntimeExecutionBridgeError } from "./runtime-execution-bridge.js";
import type { RuntimeExecutionAdmissionError } from "./runtime-execution-bridge.js";
import type { RuntimeExecutionReceiptReport } from "./runtime-execution-receipt-report.js";
import type { PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult } from "./runtime-execution-receipt-reporting-integration.js";

export const RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION = 1 as const;

export type RuntimeExecutionReceiptReportingResultSchemaVersion =
  typeof RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION;

export type RuntimeExecutionReceiptReportingPublicResult = Readonly<{
  schemaVersion: RuntimeExecutionReceiptReportingResultSchemaVersion;
  outcome: PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult["outcome"];
  report: RuntimeExecutionReceiptReport | null;
  diagnosticCodes: readonly string[];
}>;

type RuntimeExecutionReceiptReportingDiagnostic =
  | DeclarativeRuntimeExecutionBridgeError
  | RuntimeExecutionAdmissionError;

function diagnosticCode(
  diagnostic: RuntimeExecutionReceiptReportingDiagnostic,
): string {
  return diagnostic.code;
}

/**
 * Public, deterministic projection of the V13.77 integrated execution result.
 * RuntimeResult, resolution details, adapters and registries are intentionally
 * excluded from this boundary.
 */
export function projectRuntimeExecutionReceiptReportingResult(
  result: PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
): RuntimeExecutionReceiptReportingPublicResult {
  return Object.freeze({
    schemaVersion: RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION,
    outcome: result.outcome,
    report: result.report,
    diagnosticCodes: Object.freeze(result.diagnostics.map(diagnosticCode)),
  });
}

export function serializeRuntimeExecutionReceiptReportingResult(
  result: PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
): string {
  return JSON.stringify(projectRuntimeExecutionReceiptReportingResult(result));
}

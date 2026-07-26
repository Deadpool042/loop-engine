import type { RuntimeExecutionReceipt } from "./runtime-execution-bridge.js";

export const RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION = 1 as const;

export type RuntimeExecutionReceiptReportSchemaVersion =
  typeof RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION;

/**
 * Additive reporting envelope for one Runtime execution receipt.
 *
 * This contract deliberately lives in Core instead of src/execution so the
 * historical ExecutionResult/ExecutionReport schema remains unchanged.
 */
export type RuntimeExecutionReceiptReport = Readonly<{
  schemaVersion: RuntimeExecutionReceiptReportSchemaVersion;
  receipt: RuntimeExecutionReceipt;
}>;

export function createRuntimeExecutionReceiptReport(
  receipt: RuntimeExecutionReceipt,
): RuntimeExecutionReceiptReport {
  return Object.freeze({
    schemaVersion: RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION,
    receipt,
  });
}

export function serializeRuntimeExecutionReceiptReport(
  report: RuntimeExecutionReceiptReport,
): string {
  return JSON.stringify({
    schemaVersion: report.schemaVersion,
    receipt: report.receipt,
  });
}

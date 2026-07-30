import type { LoopExecutionPlanFingerprint } from "../loop/execution-plan-evidence-fingerprint.js";
import type { TrustedLoopExecutionReportImportResult } from "./trusted-loop-execution-report-boundary.js";

export const TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type TrustedLoopExecutionReportImportEvidence = Readonly<{
  schemaVersion: typeof TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION;
  status: "accepted" | "rejected";
  runId: string | null;
  executionPlanFingerprint: LoopExecutionPlanFingerprint | null;
  rejectionCode: string | null;
  detailCount: number;
}>;

/**
 * Projects an import decision into bounded, payload-free public evidence.
 * Rejection detail text and the untrusted input are deliberately excluded.
 */
export function createTrustedLoopExecutionReportImportEvidence(
  result: TrustedLoopExecutionReportImportResult,
): TrustedLoopExecutionReportImportEvidence {
  if (result.status === "accepted") {
    return Object.freeze({
      schemaVersion: TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION,
      status: "accepted" as const,
      runId: result.report.runId,
      executionPlanFingerprint: result.report.executionPlanFingerprint ?? null,
      rejectionCode: null,
      detailCount: 0,
    });
  }

  return Object.freeze({
    schemaVersion: TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION,
    status: "rejected" as const,
    runId: null,
    executionPlanFingerprint: null,
    rejectionCode: result.code,
    detailCount: result.details.length,
  });
}

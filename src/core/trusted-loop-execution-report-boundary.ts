import {
  verifyLoopExecutionReportIntegrity,
  type LoopExecutionReportIntegrityFailureCode,
} from "./loop-execution-report-integrity.js";
import type { LoopRunResult } from "../loop/types.js";

export type TrustedLoopExecutionReportImportResult =
  | Readonly<{
      status: "accepted";
      report: LoopRunResult;
    }>
  | Readonly<{
      status: "rejected";
      code: "invalid_json" | LoopExecutionReportIntegrityFailureCode;
      details: readonly string[];
    }>;

function reject(
  code: "invalid_json" | LoopExecutionReportIntegrityFailureCode,
  ...details: string[]
): TrustedLoopExecutionReportImportResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    details: Object.freeze(details),
  });
}

/**
 * The only Core entry point for importing an execution report received from an
 * external storage, transport or adapter boundary. The value remains unknown
 * until the integrity gate accepts it.
 */
export function importTrustedLoopExecutionReport(
  value: unknown,
): TrustedLoopExecutionReportImportResult {
  const verification = verifyLoopExecutionReportIntegrity(value);
  if (verification.status === "rejected") {
    return reject(verification.code, ...verification.details);
  }

  return Object.freeze({
    status: "accepted" as const,
    report: verification.report,
  });
}

/**
 * Parses serialized input without exposing JSON exceptions and immediately
 * routes the decoded value through the trusted report boundary.
 */
export function parseTrustedLoopExecutionReport(
  serialized: string,
): TrustedLoopExecutionReportImportResult {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    return reject("invalid_json", "Expected a non-empty JSON execution report.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return reject("invalid_json", "Execution report JSON could not be parsed.");
  }

  return importTrustedLoopExecutionReport(decoded);
}

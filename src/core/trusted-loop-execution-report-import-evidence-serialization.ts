import {
  TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION,
  type TrustedLoopExecutionReportImportEvidence,
} from "./trusted-loop-execution-report-import-evidence.js";

export type TrustedLoopExecutionReportImportEvidenceDecodeResult =
  | Readonly<{
      status: "accepted";
      evidence: TrustedLoopExecutionReportImportEvidence;
    }>
  | Readonly<{
      status: "rejected";
      code: "invalid_json" | "invalid_evidence";
      details: readonly string[];
    }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidFingerprint(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.algorithm === "sha256" &&
    typeof value.value === "string" &&
    /^[a-f0-9]{64}$/.test(value.value)
  );
}

function reject(
  code: "invalid_json" | "invalid_evidence",
  detail: string,
): TrustedLoopExecutionReportImportEvidenceDecodeResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    details: Object.freeze([detail]),
  });
}

export function importTrustedLoopExecutionReportImportEvidence(
  value: unknown,
): TrustedLoopExecutionReportImportEvidenceDecodeResult {
  if (!isRecord(value)) {
    return reject("invalid_evidence", "Expected an import evidence object.");
  }

  if (
    value.schemaVersion !==
      TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION ||
    (value.status !== "accepted" && value.status !== "rejected") ||
    !Number.isSafeInteger(value.detailCount) ||
    (value.detailCount as number) < 0
  ) {
    return reject("invalid_evidence", "Import evidence envelope is invalid.");
  }

  const accepted =
    value.status === "accepted" &&
    isNonEmptyString(value.runId) &&
    (value.executionPlanFingerprint === null ||
      isValidFingerprint(value.executionPlanFingerprint)) &&
    value.rejectionCode === null &&
    value.detailCount === 0;

  const rejected =
    value.status === "rejected" &&
    value.runId === null &&
    value.executionPlanFingerprint === null &&
    isNonEmptyString(value.rejectionCode);

  if (!accepted && !rejected) {
    return reject("invalid_evidence", "Import evidence fields are inconsistent.");
  }

  const fingerprint = isRecord(value.executionPlanFingerprint)
    ? Object.freeze({
        algorithm: "sha256" as const,
        value: value.executionPlanFingerprint.value as string,
      })
    : null;

  const evidence: TrustedLoopExecutionReportImportEvidence = Object.freeze({
    schemaVersion: TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_SCHEMA_VERSION,
    status: value.status,
    runId: value.runId as string | null,
    executionPlanFingerprint: fingerprint,
    rejectionCode: value.rejectionCode as string | null,
    detailCount: value.detailCount as number,
  });

  return Object.freeze({ status: "accepted" as const, evidence });
}

/** Serializes fields in a fixed schema order for stable storage and transport. */
export function serializeTrustedLoopExecutionReportImportEvidence(
  evidence: TrustedLoopExecutionReportImportEvidence,
): string {
  const imported = importTrustedLoopExecutionReportImportEvidence(evidence);
  if (imported.status === "rejected") {
    throw new TypeError("Cannot serialize invalid trusted report import evidence.");
  }

  return JSON.stringify({
    schemaVersion: imported.evidence.schemaVersion,
    status: imported.evidence.status,
    runId: imported.evidence.runId,
    executionPlanFingerprint: imported.evidence.executionPlanFingerprint,
    rejectionCode: imported.evidence.rejectionCode,
    detailCount: imported.evidence.detailCount,
  });
}

export function parseTrustedLoopExecutionReportImportEvidence(
  serialized: string,
): TrustedLoopExecutionReportImportEvidenceDecodeResult {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    return reject("invalid_json", "Expected non-empty JSON import evidence.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return reject("invalid_json", "Import evidence JSON could not be parsed.");
  }

  return importTrustedLoopExecutionReportImportEvidence(decoded);
}

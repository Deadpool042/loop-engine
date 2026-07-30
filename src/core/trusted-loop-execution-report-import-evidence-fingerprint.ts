import { createHash } from "node:crypto";

import type { TrustedLoopExecutionReportImportEvidence } from "./trusted-loop-execution-report-import-evidence.js";
import { serializeTrustedLoopExecutionReportImportEvidence } from "./trusted-loop-execution-report-import-evidence-serialization.js";

export const TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM =
  "sha256" as const;

export type TrustedLoopExecutionReportImportEvidenceFingerprint = Readonly<{
  algorithm: typeof TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM;
  value: string;
}>;

/**
 * Produces the canonical, schema-versioned payload covered by the fingerprint.
 * The serialization boundary validates the complete status-dependent contract
 * before any digest is created.
 */
export function canonicalizeTrustedLoopExecutionReportImportEvidence(
  evidence: TrustedLoopExecutionReportImportEvidence,
): string {
  return serializeTrustedLoopExecutionReportImportEvidence(evidence);
}

export function fingerprintTrustedLoopExecutionReportImportEvidence(
  evidence: TrustedLoopExecutionReportImportEvidence,
): TrustedLoopExecutionReportImportEvidenceFingerprint {
  return Object.freeze({
    algorithm:
      TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM,
    value: createHash(
      TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM,
    )
      .update(
        canonicalizeTrustedLoopExecutionReportImportEvidence(evidence),
        "utf8",
      )
      .digest("hex"),
  });
}

export function verifyTrustedLoopExecutionReportImportEvidenceFingerprint(
  evidence: TrustedLoopExecutionReportImportEvidence,
  fingerprint: TrustedLoopExecutionReportImportEvidenceFingerprint,
): boolean {
  if (
    fingerprint.algorithm !==
      TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM ||
    !/^[a-f0-9]{64}$/.test(fingerprint.value)
  ) {
    return false;
  }

  return (
    fingerprintTrustedLoopExecutionReportImportEvidence(evidence).value ===
    fingerprint.value
  );
}

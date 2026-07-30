import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeTrustedLoopExecutionReportImportEvidence,
  fingerprintTrustedLoopExecutionReportImportEvidence,
  TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM,
  verifyTrustedLoopExecutionReportImportEvidenceFingerprint,
} from "../../src/core/trusted-loop-execution-report-import-evidence-fingerprint.js";
import type { TrustedLoopExecutionReportImportEvidence } from "../../src/core/trusted-loop-execution-report-import-evidence.js";

const acceptedEvidence: TrustedLoopExecutionReportImportEvidence = Object.freeze({
  schemaVersion: 1,
  status: "accepted",
  runId: "run-import-evidence-1",
  executionPlanFingerprint: Object.freeze({
    algorithm: "sha256",
    value: "a".repeat(64),
  }),
  rejectionCode: null,
  detailCount: 0,
});

const rejectedEvidence: TrustedLoopExecutionReportImportEvidence = Object.freeze({
  schemaVersion: 1,
  status: "rejected",
  runId: null,
  executionPlanFingerprint: null,
  rejectionCode: "invalid_report",
  detailCount: 2,
});

test("canonicalizes import evidence through the stable serialization boundary", () => {
  assert.equal(
    canonicalizeTrustedLoopExecutionReportImportEvidence(acceptedEvidence),
    `{"schemaVersion":1,"status":"accepted","runId":"run-import-evidence-1","executionPlanFingerprint":{"algorithm":"sha256","value":"${"a".repeat(64)}"},"rejectionCode":null,"detailCount":0}`,
  );
});

test("creates a frozen canonical SHA-256 fingerprint", () => {
  const fingerprint =
    fingerprintTrustedLoopExecutionReportImportEvidence(acceptedEvidence);

  assert.equal(
    fingerprint.algorithm,
    TRUSTED_LOOP_EXECUTION_REPORT_IMPORT_EVIDENCE_FINGERPRINT_ALGORITHM,
  );
  assert.match(fingerprint.value, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(fingerprint), true);
  assert.equal(
    verifyTrustedLoopExecutionReportImportEvidenceFingerprint(
      acceptedEvidence,
      fingerprint,
    ),
    true,
  );
});

test("distinguishes accepted and rejected import decisions", () => {
  assert.notEqual(
    fingerprintTrustedLoopExecutionReportImportEvidence(acceptedEvidence).value,
    fingerprintTrustedLoopExecutionReportImportEvidence(rejectedEvidence).value,
  );
});

test("detects evidence drift", () => {
  const fingerprint =
    fingerprintTrustedLoopExecutionReportImportEvidence(acceptedEvidence);
  const changedEvidence = Object.freeze({
    ...acceptedEvidence,
    runId: "run-import-evidence-2",
  });

  assert.equal(
    verifyTrustedLoopExecutionReportImportEvidenceFingerprint(
      changedEvidence,
      fingerprint,
    ),
    false,
  );
});

test("rejects unsupported algorithms and malformed digests", () => {
  assert.equal(
    verifyTrustedLoopExecutionReportImportEvidenceFingerprint(
      acceptedEvidence,
      { algorithm: "sha512", value: "a".repeat(64) } as never,
    ),
    false,
  );
  assert.equal(
    verifyTrustedLoopExecutionReportImportEvidenceFingerprint(
      acceptedEvidence,
      { algorithm: "sha256", value: "not-a-digest" },
    ),
    false,
  );
});

test("fails closed before hashing invalid import evidence", () => {
  assert.throws(
    () =>
      fingerprintTrustedLoopExecutionReportImportEvidence({
        ...acceptedEvidence,
        rejectionCode: "invalid_report",
      }),
    TypeError,
  );
});

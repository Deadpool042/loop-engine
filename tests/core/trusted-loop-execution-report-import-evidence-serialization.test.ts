import assert from "node:assert/strict";
import { test } from "node:test";

import {
  importTrustedLoopExecutionReportImportEvidence,
  parseTrustedLoopExecutionReportImportEvidence,
  serializeTrustedLoopExecutionReportImportEvidence,
} from "../../src/core/trusted-loop-execution-report-import-evidence-serialization.js";
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

test("serializes import evidence with stable field ordering", () => {
  assert.equal(
    serializeTrustedLoopExecutionReportImportEvidence(acceptedEvidence),
    `{"schemaVersion":1,"status":"accepted","runId":"run-import-evidence-1","executionPlanFingerprint":{"algorithm":"sha256","value":"${"a".repeat(64)}"},"rejectionCode":null,"detailCount":0}`,
  );
});

test("parses and freezes valid serialized evidence", () => {
  const result = parseTrustedLoopExecutionReportImportEvidence(
    serializeTrustedLoopExecutionReportImportEvidence(acceptedEvidence),
  );

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.deepEqual(result.evidence, acceptedEvidence);
    assert.equal(Object.isFrozen(result.evidence), true);
    assert.equal(Object.isFrozen(result.evidence.executionPlanFingerprint), true);
  }
});

test("rejects malformed JSON without throwing", () => {
  assert.deepEqual(parseTrustedLoopExecutionReportImportEvidence("{bad-json"), {
    status: "rejected",
    code: "invalid_json",
    details: ["Import evidence JSON could not be parsed."],
  });
});

test("fails closed on inconsistent accepted evidence", () => {
  const result = importTrustedLoopExecutionReportImportEvidence({
    ...acceptedEvidence,
    rejectionCode: "invalid_report",
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "invalid_evidence");
  }
});

test("accepts bounded rejected evidence", () => {
  const result = importTrustedLoopExecutionReportImportEvidence({
    schemaVersion: 1,
    status: "rejected",
    runId: null,
    executionPlanFingerprint: null,
    rejectionCode: "invalid_json",
    detailCount: 1,
  });

  assert.equal(result.status, "accepted");
});

test("rejects malformed fingerprint values", () => {
  const result = importTrustedLoopExecutionReportImportEvidence({
    ...acceptedEvidence,
    executionPlanFingerprint: { algorithm: "sha256", value: "not-a-digest" },
  });

  assert.equal(result.status, "rejected");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  importTrustedLoopExecutionReport,
  parseTrustedLoopExecutionReport,
} from "../../src/core/trusted-loop-execution-report-boundary.js";

const validReport = Object.freeze({
  schemaVersion: 1,
  runId: "run-trusted-boundary-1",
  project: "fixture",
  mode: "plan",
  status: "completed",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  candidate: null,
  steps: [],
  validation: null,
  modifiedFiles: [],
  commit: null,
  publication: null,
  failure: null,
  agentPolicy: null,
  contextPackage: null,
  executionPlanEvidence: null,
  executionPlanFingerprint: null,
});

test("imports an integrity-verified execution report", () => {
  const result = importTrustedLoopExecutionReport(validReport);

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.report, validReport);
    assert.equal(result.report.runId, "run-trusted-boundary-1");
  }
});

test("parses serialized reports through the same integrity gate", () => {
  const result = parseTrustedLoopExecutionReport(JSON.stringify(validReport));

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.report.runId, "run-trusted-boundary-1");
  }
});

test("rejects malformed JSON without throwing", () => {
  const result = parseTrustedLoopExecutionReport("{not-json");

  assert.deepEqual(result, {
    status: "rejected",
    code: "invalid_json",
    details: ["Execution report JSON could not be parsed."],
  });
});

test("fails closed when evidence and fingerprint are not an atomic pair", () => {
  const result = importTrustedLoopExecutionReport({
    ...validReport,
    executionPlanEvidence: {
      schemaVersion: 1,
    },
    executionPlanFingerprint: null,
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "evidence_pair_mismatch");
  }
});

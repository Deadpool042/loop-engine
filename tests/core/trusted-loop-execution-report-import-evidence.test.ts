import assert from "node:assert/strict";
import { test } from "node:test";

import { createTrustedLoopExecutionReportImportEvidence } from "../../src/core/trusted-loop-execution-report-import-evidence.js";
import { importTrustedLoopExecutionReport } from "../../src/core/trusted-loop-execution-report-boundary.js";

const validReport = Object.freeze({
  schemaVersion: 1,
  runId: "run-import-evidence-1",
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

test("projects accepted imports into bounded evidence", () => {
  const result = importTrustedLoopExecutionReport(validReport);
  const evidence = createTrustedLoopExecutionReportImportEvidence(result);

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    status: "accepted",
    runId: "run-import-evidence-1",
    executionPlanFingerprint: null,
    rejectionCode: null,
    detailCount: 0,
  });
  assert.equal(Object.isFrozen(evidence), true);
});

test("projects rejected imports without exposing payload or detail text", () => {
  const result = importTrustedLoopExecutionReport({
    ...validReport,
    executionPlanEvidence: { schemaVersion: 1 },
    executionPlanFingerprint: null,
  });
  const evidence = createTrustedLoopExecutionReportImportEvidence(result);

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    status: "rejected",
    runId: null,
    executionPlanFingerprint: null,
    rejectionCode: "evidence_pair_mismatch",
    detailCount: 1,
  });
  assert.equal("details" in evidence, false);
  assert.equal(JSON.stringify(evidence).includes("Execution-plan evidence"), false);
});

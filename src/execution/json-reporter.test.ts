import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createExecutionJsonReport,
  renderExecutionJson,
} from "./json-reporter.js";

describe("ExecutionJsonReporter", () => {
  it("creates a structured execution report", () => {
    const report = createExecutionJsonReport({
      schemaVersion: 1,
      sessionId: "session-42",
      status: "completed",
      startedAt: "t1",
      completedAt: "t4",
      failure: null,
      steps: [
        {
          name: "step-a",
          startedAt: "t1",
          completedAt: "t2",
          success: true,
          details: ["detail-a"],
        },
        {
          name: "step-b",
          startedAt: "t3",
          completedAt: "t4",
          success: false,
          details: ["detail-b", "detail-c"],
        },
      ],
    });

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.summary.sessionId, "session-42");
    assert.equal(report.summary.stepCount, 2);
    assert.equal(report.summary.succeeded, 1);
    assert.equal(report.summary.failed, 1);

    assert.deepEqual(report.steps, [
      {
        name: "step-a",
        status: "success",
        startedAt: "t1",
        completedAt: "t2",
        detailCount: 1,
        details: ["detail-a"],
      },
      {
        name: "step-b",
        status: "failed",
        startedAt: "t3",
        completedAt: "t4",
        detailCount: 2,
        details: ["detail-b", "detail-c"],
      },
    ]);
  });

  it("renders valid JSON", () => {
    const output = renderExecutionJson({
      schemaVersion: 1,
      sessionId: "session-empty",
      status: "completed",
      startedAt: "t1",
      completedAt: "t2",
      failure: null,
      steps: [],
    });

    const parsed = JSON.parse(output);

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.summary.sessionId, "session-empty");
    assert.deepEqual(parsed.steps, []);
  });
});

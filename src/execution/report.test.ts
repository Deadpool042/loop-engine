import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderExecutionReport, type ExecutionReportFormat } from "./report.js";
import type { ExecutionResult } from "./types.js";

const result: ExecutionResult = {
  schemaVersion: 1,
  sessionId: "session-42",
  status: "completed",
  startedAt: "t1",
  completedAt: "t2",
  failure: null,
  steps: [
    {
      name: "step-a",
      startedAt: "t1",
      completedAt: "t2",
      success: true,
      details: ["detail-a"],
    },
  ],
};

describe("ExecutionReport", () => {
  it("renders text reports", () => {
    const output = renderExecutionReport(result, {
      format: "text",
    });

    assert.match(output, /^Execution session-42/m);
    assert.match(output, /Step details:/);
  });

  it("renders markdown reports", () => {
    const output = renderExecutionReport(result, {
      format: "markdown",
    });

    assert.match(output, /^# Execution session-42/m);
    assert.match(output, /^## Step details$/m);
  });

  it("renders JSON reports", () => {
    const output = renderExecutionReport(result, {
      format: "json",
    });

    const parsed = JSON.parse(output);

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.summary.sessionId, "session-42");
  });

  it("supports every declared format", () => {
    const formats: readonly ExecutionReportFormat[] = [
      "text",
      "markdown",
      "json",
    ];

    for (const format of formats) {
      assert.equal(typeof renderExecutionReport(result, { format }), "string");
    }
  });
});

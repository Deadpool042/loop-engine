import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExecutionJsonReport } from "../../src/execution/json-reporter.js";
import { executionFixture } from "../fixtures/execution-result.js";

describe("execution json reporter", () => {
  it("creates a structured report", () => {
    const report = createExecutionJsonReport(executionFixture);

    assert.equal(report.schemaVersion, 1);

    assert.equal(report.summary.sessionId, "session-1");
    assert.equal(report.summary.status, "completed");

    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].name, "plan");
    assert.equal(report.steps[0].status, "success");
    assert.equal(report.steps[0].detailCount, 2);
  });
});

  it("returns a deeply frozen report", () => {
    const report = createExecutionJsonReport(executionFixture);

    assert.ok(Object.isFrozen(report));
    assert.ok(Object.isFrozen(report.summary));
    assert.ok(Object.isFrozen(report.steps));
    assert.ok(Object.isFrozen(report.steps[0]));
    assert.ok(Object.isFrozen(report.steps[0].details));
  });

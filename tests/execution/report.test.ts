import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderExecutionReport } from "../../src/execution/report.js";

import { executionFixture } from "../fixtures/execution-result.js";

describe("execution report", () => {
  it("renders text", () => {
    const out = renderExecutionReport(executionFixture, {
      format: "text",
    });

    assert.match(out, /session-1/);
    assert.match(out, /completed/);
  });

  it("renders markdown", () => {
    const out = renderExecutionReport(executionFixture, {
      format: "markdown",
    });

    assert.match(out, /session-1/);
  });

  it("renders json", () => {
    const out = renderExecutionReport(executionFixture, {
      format: "json",
    });

    const parsed = JSON.parse(out);

    assert.equal(parsed.summary.sessionId, "session-1");
    assert.equal(parsed.summary.status, "completed");
  });
});

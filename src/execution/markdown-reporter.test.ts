import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderExecutionMarkdown } from "./markdown-reporter.js";

describe("ExecutionMarkdownReporter", () => {
  it("renders execution statistics and step details as markdown", () => {
    const output = renderExecutionMarkdown({
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

    assert.match(output, /^# Execution session-42/m);
    assert.match(output, /- Status: completed/);
    assert.match(output, /- Steps: 2/);
    assert.match(output, /- Succeeded: 1/);
    assert.match(output, /- Failed: 1/);

    assert.match(output, /^## Step details$/m);
    assert.match(output, /^### step-a$/m);
    assert.match(output, /- Status: success/);
    assert.match(output, /- Details: 1/);

    assert.match(output, /^### step-b$/m);
    assert.match(output, /- Status: failed/);
    assert.match(output, /- Details: 2/);
  });

  it("omits the step details section when no steps exist", () => {
    const output = renderExecutionMarkdown({
      schemaVersion: 1,
      sessionId: "session-empty",
      status: "completed",
      startedAt: "t1",
      completedAt: "t2",
      steps: [],
      failure: null,
    });

    assert.doesNotMatch(output, /## Step details/);
  });
});

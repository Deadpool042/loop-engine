import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderExecutionText } from "./reporter.js";

describe("ExecutionReporter", () => {
  it("renders execution statistics", () => {
    const output = renderExecutionText({
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
          completedAt: "t1",
          success: true,
          details: [],
        },
        {
          name: "step-b",
          startedAt: "t2",
          completedAt: "t2",
          success: false,
          details: [],
        },
      ],
    });

    assert.match(output, /session-42/);
    assert.match(output, /Status: completed/);
    assert.match(output, /Steps: 2/);
    assert.match(output, /Succeeded: 1/);
    assert.match(output, /Failed: 1/);
  });
});

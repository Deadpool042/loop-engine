import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ExecutionResult } from "../../src/execution/types.js";

describe("execution types", () => {
  it("accepts a valid execution result", () => {
    const result: ExecutionResult = {
      schemaVersion: 1,
      sessionId: "session-1",
      status: "prepared",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      steps: [],
      failure: null,
    };

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.status, "prepared");
    assert.equal(result.steps.length, 0);
    assert.equal(result.failure, null);
  });
});

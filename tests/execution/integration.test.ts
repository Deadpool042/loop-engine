import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createExecutionPlan } from "../../src/executor/index.js";
import { executePlan } from "../../src/execution/index.js";

describe("executor → execution integration", () => {
  it("executes a prepared execution plan", () => {
    const plan = createExecutionPlan({
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = executePlan(
      plan,
      () => "2026-01-01T00:00:00.000Z",
    );

    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
  });
});

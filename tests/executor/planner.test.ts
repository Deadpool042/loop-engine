import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExecutionPlan } from "../../src/executor/planner.js";

describe("createExecutionPlan", () => {
  it("creates a prepared execution session", () => {
    const session = createExecutionPlan({
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    assert.equal(session.sessionId, "session-1");
    assert.equal(session.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(session.executionMode, "plan");
    assert.equal(session.executionState, "prepared");
    assert.ok(Object.isFrozen(session));
  });
});

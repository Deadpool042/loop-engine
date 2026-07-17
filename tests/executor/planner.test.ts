import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExecutionPlan } from "../../src/executor/planner.js";

describe("createExecutionPlan", () => {
  it("creates a prepared execution plan", () => {
    const plan = createExecutionPlan({
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    assert.equal(plan.session.sessionId, "session-1");
    assert.equal(plan.session.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(plan.session.executionMode, "plan");
    assert.equal(plan.session.executionState, "prepared");

    assert.deepEqual(plan.steps, []);

    assert.ok(Object.isFrozen(plan));
    assert.ok(Object.isFrozen(plan.session));
    assert.ok(Object.isFrozen(plan.steps));
  });
});

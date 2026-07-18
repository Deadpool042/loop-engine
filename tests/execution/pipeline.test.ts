import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { executePlan } from "../../src/execution/pipeline.js";
import type { ExecutionPlan } from "../../src/executor/types.js";

describe("execution pipeline", () => {
  it("executes an execution plan", () => {
    const plan: ExecutionPlan = {
      session: {
        sessionId: "session-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        executionMode: "plan",
        executionState: "prepared",
      },
      steps: [
        {
          name: "step-1",
          details: ["detail-1"],
        },
        {
          name: "step-2",
          details: ["detail-2"],
        },
      ],
    };

    const result = executePlan(plan, () => "2026-01-01T00:00:00.000Z");

    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.equal(result.steps.length, 2);

    assert.equal(result.steps[0]?.name, "step-1");
    assert.deepEqual(result.steps[0]?.details, ["detail-1"]);

    assert.equal(result.steps[1]?.name, "step-2");
    assert.deepEqual(result.steps[1]?.details, ["detail-2"]);
  });
});

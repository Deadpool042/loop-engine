import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { executionStepsFromPlan } from "../../src/execution/from-plan.js";
import type { ExecutionPlan } from "../../src/executor/types.js";

describe("executionStepsFromPlan", () => {
  it("maps an execution plan to execution steps", () => {
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
          details: ["a"],
        },
        {
          name: "step-2",
          details: ["b"],
        },
      ],
    };

    const steps = executionStepsFromPlan(plan);

    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.name, "step-1");
    assert.deepEqual(steps[0]?.run(), ["a"]);
    assert.equal(steps[1]?.name, "step-2");
  });
});

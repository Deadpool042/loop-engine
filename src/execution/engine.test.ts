import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/execution/engine.js";
import type { ExecutionStep } from "../../src/execution/types.js";

describe("execution engine", () => {
  const now = (() => {
    let i = 0;
    return () => `2026-01-01T00:00:${String(i++).padStart(2, "0")}.000Z`;
  })();

  it("executes steps sequentially", () => {
    const executed: string[] = [];

    const steps: ExecutionStep[] = [
      {
        name: "step-1",
        run: () => {
          executed.push("step-1");
          return ["ok"];
        },
      },
      {
        name: "step-2",
        run: () => {
          executed.push("step-2");
          return ["ok"];
        },
      },
    ];

    const result = execute(steps, {
      sessionId: "session-1",
      now,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.deepEqual(executed, ["step-1", "step-2"]);
    assert.equal(result.steps.length, 2);
  });

  it("stops on the first failure", () => {
    const steps: ExecutionStep[] = [
      {
        name: "step-1",
        run: () => ["ok"],
      },
      {
        name: "step-2",
        run: () => {
          throw new Error("boom");
        },
      },
      {
        name: "step-3",
        run: () => ["never"],
      },
    ];

    const result = execute(steps, {
      sessionId: "session-2",
      now: () => "2026-01-01T00:00:00.000Z",
    });

    assert.equal(result.status, "failed");
    assert.ok(result.failure);
    assert.equal(result.failure?.message, "boom");
    assert.equal(result.steps.length, 1);
  });
});
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executionResultFromLoopRun } from "./loop-run.js";
import type { LoopRunResult } from "../../loop/types.js";

describe("executionResultFromLoopRun", () => {
  it("maps a LoopRunResult into an ExecutionResult", () => {
    const input = {
      runId: "run-1",
      project: "demo",
      mode: "plan",
      status: "completed",
      startedAt: "t1",
      completedAt: "t2",
      candidate: null,
      validation: null,
      modifiedFiles: [],
      commit: null,
      publication: null,
      agentPolicy: null,
      contextPackage: null,
      failure: null,
      steps: [
        {
          name: "plan",
          status: "completed",
          startedAt: "t1",
          completedAt: "t2",
          details: ["detail"],
        },
      ],
      schemaVersion: 1
    } satisfies LoopRunResult;

    const execution = executionResultFromLoopRun(input);


    assert.equal(execution.sessionId, "run-1");
    assert.equal(execution.status, "completed");
    assert.equal(execution.steps.length, 1);
    assert.equal(execution.steps[0]?.success, true);
    assert.deepEqual(execution.steps[0]?.details, ["detail"]);
    assert.equal(execution.failure, null);
  });
});

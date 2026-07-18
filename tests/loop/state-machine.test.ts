import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canTransition } from "../../src/loop/state-machine.js";
import { LOOP_RUN_STATUSES, type LoopRunStatus } from "../../src/loop/types.js";

const VALID_TRANSITIONS: readonly [LoopRunStatus, LoopRunStatus][] = [
  ["idle", "planning"],
  ["planning", "ready"],
  ["planning", "blocked"],
  ["planning", "failed"],
  ["ready", "executing"],
  ["ready", "completed"],
  ["ready", "cancelled"],
  ["executing", "validating"],
  ["executing", "failed"],
  ["executing", "cancelled"],
  ["validating", "completed"],
  ["validating", "repairing"],
  ["validating", "failed"],
  ["repairing", "executing"],
  ["repairing", "validating"],
  ["repairing", "failed"],
  ["completed", "idle"],
];

describe("canTransition", () => {
  for (const [from, to] of VALID_TRANSITIONS) {
    it(`allows ${from} -> ${to}`, () => {
      assert.equal(canTransition(from, to), true);
    });
  }

  it("rejects every transition not explicitly documented", () => {
    const validSet = new Set(
      VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
    );

    for (const from of LOOP_RUN_STATUSES) {
      for (const to of LOOP_RUN_STATUSES) {
        const expected = validSet.has(`${from}->${to}`);
        assert.equal(
          canTransition(from, to),
          expected,
          `canTransition(${from}, ${to}) should be ${expected}`,
        );
      }
    }
  });

  it("never allows a transition to the same status", () => {
    for (const status of LOOP_RUN_STATUSES) {
      assert.equal(canTransition(status, status), false);
    }
  });

  it("never allows leaving a terminal status other than completed", () => {
    for (const terminal of ["blocked", "failed", "cancelled"] as const) {
      for (const to of LOOP_RUN_STATUSES) {
        assert.equal(canTransition(terminal, to), false);
      }
    }
  });

  it("never allows cancelled from completed", () => {
    assert.equal(canTransition("completed", "cancelled"), false);
  });
});

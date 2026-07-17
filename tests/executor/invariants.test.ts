import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertExecutionState,
  assertExecutionTransition,
} from "../../src/executor/invariants.js";
import { createExecutionSession } from "../../src/executor/session.js";

describe("executor invariants", () => {
  it("accepts the expected execution state", () => {
    const session = createExecutionSession({
      sessionId: "session-1",
      createdAt: "2026-07-17T10:00:00Z",
    });

    assert.doesNotThrow(() => {
      assertExecutionState(session, "created");
    });
  });

  it("rejects an unexpected execution state", () => {
    const session = createExecutionSession({
      sessionId: "session-1",
      createdAt: "2026-07-17T10:00:00Z",
    });

    assert.throws(() => {
      assertExecutionState(session, "prepared");
    });
  });

  it("accepts a valid transition", () => {
    assert.doesNotThrow(() => {
      assertExecutionTransition("created", "prepared");
    });
  });

  it("rejects an invalid transition", () => {
    assert.throws(() => {
      assertExecutionTransition("prepared", "created");
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExecutionSession } from "../../src/executor/session.js";

describe("createExecutionSession", () => {
  it("creates a default planning session", () => {
    const session = createExecutionSession({
      sessionId: "session-1",
      createdAt: "2026-07-17T08:45:00Z",
    });

    assert.deepEqual(session, {
      sessionId: "session-1",
      createdAt: "2026-07-17T08:45:00Z",
      executionMode: "plan",
      executionState: "created",
    });
  });

  it("returns an immutable session", () => {
    const session = createExecutionSession({
      sessionId: "session-2",
      createdAt: "2026-07-17T08:45:00Z",
    });

    assert.equal(Object.isFrozen(session), true);
  });
});

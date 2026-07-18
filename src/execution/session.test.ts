import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  completeExecution,
  createExecutionSession,
  failExecution,
  startExecution,
} from "../../src/execution/session.js";

describe("execution session", () => {
  it("starts in prepared state", () => {
    const session = createExecutionSession(
      "session-1",
      "2026-01-01T00:00:00.000Z",
    );

    assert.equal(session.status, "prepared");
  });

  it("transitions prepared -> running", () => {
    const session = createExecutionSession(
      "session-1",
      "2026-01-01T00:00:00.000Z",
    );

    const running = startExecution(session);

    assert.equal(running.status, "running");
    assert.notStrictEqual(running, session);
  });

  it("transitions running -> completed", () => {
    const session = startExecution(
      createExecutionSession("session-1", "2026-01-01T00:00:00.000Z"),
    );

    const completed = completeExecution(session);

    assert.equal(completed.status, "completed");
  });

  it("transitions running -> failed", () => {
    const session = startExecution(
      createExecutionSession("session-1", "2026-01-01T00:00:00.000Z"),
    );

    const failed = failExecution(session);

    assert.equal(failed.status, "failed");
  });
});

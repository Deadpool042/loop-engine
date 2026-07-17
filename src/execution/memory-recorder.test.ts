import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createMemoryExecutionEventRecorder } from "./memory-recorder.js";

describe("MemoryExecutionEventRecorder", () => {
  it("records events in order", () => {
    const recorder = createMemoryExecutionEventRecorder();

    recorder.record({
      type: "execution.started",
      sessionId: "session-1",
      at: "2026-01-01T00:00:00Z",
    });

    recorder.record({
      type: "execution.completed",
      sessionId: "session-1",
      at: "2026-01-01T00:00:01Z",
    });

    assert.deepEqual(
      recorder.events.map((event) => event.type),
      [
        "execution.started",
        "execution.completed",
      ],
    );
  });
});

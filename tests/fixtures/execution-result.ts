import type { ExecutionResult } from "../../src/execution/types.js";

export const executionFixture: ExecutionResult = {
  schemaVersion: 1,
  sessionId: "session-1",
  status: "completed",
  startedAt: "2026-01-01T10:00:00Z",
  completedAt: "2026-01-01T10:01:00Z",
  failure: null,
  steps: [
    {
      name: "plan",
      startedAt: "2026-01-01T10:00:00Z",
      completedAt: "2026-01-01T10:00:10Z",
      success: true,
      details: ["candidate selected", "roadmap generated"],
    },
  ],
};

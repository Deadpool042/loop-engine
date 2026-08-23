import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSummaryResponse } from "../../src/gui/desktop/summary-contract.js";

describe("GUI summary contract", () => {
  it("accepts the documented summary fields used by the renderer", () => {
    assert.deepEqual(
      parseSummaryResponse({
        schemaVersion: 1,
        projects: [
          {
            project: { name: "loop-engine", type: "node", path: "." },
            git: { branch: "main", clean: true },
            health: "good",
            workAvailability: {
              actionable: false,
              reason: "no_admissible_candidate",
            },
            lastRun: {
              status: "blocked",
              completedAt: "2026-08-23T09:00:00.000Z",
            },
            runHistoryCorruptedLines: 1,
          },
        ],
      }),
      {
        schemaVersion: 1,
        projects: [
          {
            project: { name: "loop-engine", type: "node", path: "." },
            git: { branch: "main", clean: true },
            health: "good",
            workAvailability: {
              actionable: false,
              reason: "no_admissible_candidate",
            },
            lastRun: {
              status: "blocked",
              completedAt: "2026-08-23T09:00:00.000Z",
            },
            runHistoryCorruptedLines: 1,
          },
        ],
      },
    );
  });

  it("rejects malformed responses before they reach the renderer", () => {
    assert.equal(
      parseSummaryResponse({ schemaVersion: 1, projects: [{}] }),
      null,
    );
    assert.equal(
      parseSummaryResponse({ schemaVersion: 2, projects: [] }),
      null,
    );
  });
});

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

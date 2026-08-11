import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseContextDetail } from "../../src/gui/desktop/context-contract.js";

describe("GUI context contract", () => {
  it("accepts only the context fields rendered by the detail panel", () => {
    assert.deepEqual(
      parseContextDetail({
        schemaVersion: 1,
        docs: { required: ["README.md"], missing: [] },
        roadmap: {
          available: true,
          paths: ["docs/roadmap.md"],
          selectedCandidate: {
            path: "docs/roadmap.md",
            line: 12,
            text: "Next safe lot",
            kind: "safe",
            status: "todo",
          },
        },
        validation: { configured: true, commands: ["pnpm run validate"] },
      }),
      {
        docs: { required: ["README.md"], missing: [] },
        roadmap: {
          available: true,
          paths: ["docs/roadmap.md"],
          selectedCandidate: {
            path: "docs/roadmap.md",
            line: 12,
            text: "Next safe lot",
            kind: "safe",
            status: "todo",
          },
        },
        validation: { configured: true, commands: ["pnpm run validate"] },
      },
    );
  });

  it("rejects malformed rendered context fields", () => {
    assert.equal(
      parseContextDetail({
        schemaVersion: 1,
        docs: { required: ["README.md"], missing: [] },
        roadmap: { available: true, paths: [], selectedCandidate: null },
        validation: { configured: true, commands: [false] },
      }),
      null,
    );
  });
});

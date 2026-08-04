import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { promptCopyText } from "../renderer/project-actions.js";
import type { ProjectPromptReport } from "../shared/project-prompt.js";

function report(): ProjectPromptReport {
  return {
    schemaVersion: 1,
    project: { name: "loop-engine", type: "node-cli", path: "/tmp/loop-engine" },
    git: {},
    docs: {},
    roadmap: { selectedCandidate: null },
    validation: {},
    instructions: ["do the thing"],
  };
}

describe("promptCopyText", () => {
  it("returns null when no prompt state is present yet", () => {
    assert.equal(promptCopyText(undefined), null);
  });

  it("returns null while the prompt is loading", () => {
    assert.equal(promptCopyText({ status: "loading" }), null);
  });

  it("returns null when the prompt failed to load", () => {
    assert.equal(
      promptCopyText({ status: "error", message: "boom" }),
      null,
    );
  });

  it("returns the exact JSON serialization used by the section's own copy button", () => {
    const value = report();

    assert.equal(
      promptCopyText({ status: "success", value }),
      JSON.stringify(value, null, 2),
    );
  });
});

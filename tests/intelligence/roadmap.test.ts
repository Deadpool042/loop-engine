import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectRoadmapCandidate, type RoadmapCandidate } from "../../src/intelligence/roadmap.js";

function candidate(kind: RoadmapCandidate["kind"], text: string): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text,
    kind,
    reason: kind === "safe" ? "no sensitive keyword detected" : `contains "${text}"`,
  };
}

describe("selectRoadmapCandidate", () => {
  it("prefers safe candidates over warning and blocked candidates", () => {
    const selected = selectRoadmapCandidate([
      candidate("blocked", "migration"),
      candidate("warning", "bascule"),
      candidate("safe", "simple docs update"),
    ]);

    assert.equal(selected?.kind, "safe");
    assert.equal(selected?.text, "simple docs update");
  });

  it("falls back to warning when no safe candidate exists", () => {
    const selected = selectRoadmapCandidate([
      candidate("blocked", "migration"),
      candidate("warning", "bascule"),
    ]);

    assert.equal(selected?.kind, "warning");
  });

  it("falls back to blocked when only blocked candidates exist", () => {
    const selected = selectRoadmapCandidate([
      candidate("blocked", "production finale"),
    ]);

    assert.equal(selected?.kind, "blocked");
  });

  it("returns null when no candidate exists", () => {
    const selected = selectRoadmapCandidate([]);

    assert.equal(selected, null);
  });
});

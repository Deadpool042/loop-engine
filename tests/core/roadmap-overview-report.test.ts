import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import { generateRoadmapOverviewReport } from "../../src/core/reports.js";

function setupProject(roadmap: string): { path: string; cleanup: () => void } {
  const path = join(
    tmpdir(),
    `loop-roadmap-overview-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "roadmap.md"), roadmap);
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

function project(path: string): ProjectConfig {
  return {
    name: "example",
    path,
    type: "fixture",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap" },
    roadmap: ["roadmap.md"],
  };
}

test("exposes a roadmap deterministically without requiring an objective source", () => {
  const fixture = setupProject(
    [
      "- [x] [P2] Delivered lot",
      "- [ ] [P1] Next lot",
      "- [ ] [P3] Later lot",
    ].join("\n"),
  );

  try {
    const report = generateRoadmapOverviewReport(project(fixture.path));

    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(report.project, { name: "example", type: "fixture" });
    assert.equal(report.planning.mode, "roadmap");
    assert.equal(report.roadmap.candidates.total, 3);
    assert.equal(report.roadmap.candidates.items.length, 3);
    assert.equal(report.roadmap.stats.done, 1);
    assert.equal(report.roadmap.stats.todo, 2);
    assert.equal(report.roadmap.selectedCandidate?.priority, "p1");
    assert.match(report.roadmap.selectedCandidate?.text ?? "", /Next lot/);
  } finally {
    fixture.cleanup();
  }
});

test("projects closed phase-gates and candidate admissibility for a read-only cockpit", () => {
  const fixture = setupProject(
    [
      "<!-- loop-engine:phase-gate phase=H5 state=closed blockedBy=retours-terrain-2027 -->",
      "| H5-L1 | Deferred lot | ⬜ À faire |",
    ].join("\n"),
  );

  try {
    const report = generateRoadmapOverviewReport(project(fixture.path));

    assert.equal(report.roadmap.phaseGates.total, 1);
    assert.equal(report.roadmap.phaseGates.items[0]?.state, "closed");
    assert.equal(report.roadmap.candidates.items[0]?.admissibility?.state, "not_admissible");
    assert.equal(report.roadmap.selectedCandidate, null);
  } finally {
    fixture.cleanup();
  }
});

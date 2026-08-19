import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import { generateRoadmapProposalContextReport } from "../../src/core/reports.js";
import { MAX_PROPOSAL_CONTEXT_CANDIDATES } from "../../src/intelligence/proposal-context.js";

function setupProject(
  files: Readonly<Record<string, string>>,
): { path: string; cleanup: () => void } {
  const path = join(
    tmpdir(),
    `loop-proposal-context-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

function project(
  path: string,
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  return {
    name: "example",
    path,
    type: "fixture",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap", objective_source: "objective.md" },
    roadmap: ["roadmap.md"],
    ...overrides,
  };
}

test("builds a V1 proposal context from canonical snapshot data", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": "- [ ] [P1] Connect the bounded context",
  });
  try {
    const before = readdirSync(fixture.path).sort();
    const report = generateRoadmapProposalContextReport(project(fixture.path));
    const after = readdirSync(fixture.path).sort();

    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(report.project, { name: "example", type: "fixture" });
    assert.equal(report.planning.mode, "roadmap");
    assert.equal(report.objective.content, "Canonical objective.");
    assert.equal(report.context, "available");
    assert.equal(report.roadmap.selectedCandidate?.priority, "p1");
    assert.equal(report.roadmap.candidates.total, 1);
    assert.equal(report.projectState.git.clean, true);
    assert.deepEqual(after, before);
  } finally {
    fixture.cleanup();
  }
});

test("keeps an explicitly requested completed roadmap eligible for context", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": "- [x] Completed milestone",
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.equal(report.roadmap.stats.todo, 0);
    assert.equal(report.roadmap.summary.selectable, 0);
  } finally {
    fixture.cleanup();
  }
});

test("includes closed phase-gates and canonical blockedBy reasons", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": [
      "<!-- loop-engine:phase-gate phase=H4 state=closed blockedBy=retours-terrain-2027 -->",
      "| H4-L1 | Deferred work | ⬜ À faire |",
    ].join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.deepEqual(report.roadmap.phaseGates.items, [
      {
        path: "roadmap.md",
        line: 1,
        phaseId: "H4",
        state: "closed",
        blockedBy: "retours-terrain-2027",
      },
    ]);
    assert.equal(
      report.roadmap.candidates.items[0]?.admissibility?.reason,
      "phase_closed",
    );
  } finally {
    fixture.cleanup();
  }
});

test("bounds structured candidate output without changing canonical stats", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": Array.from(
      { length: MAX_PROPOSAL_CONTEXT_CANDIDATES + 1 },
      (_, index) => `- [ ] Candidate ${index + 1}`,
    ).join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.equal(
      report.roadmap.candidates.items.length,
      MAX_PROPOSAL_CONTEXT_CANDIDATES,
    );
    assert.equal(report.roadmap.candidates.total, MAX_PROPOSAL_CONTEXT_CANDIDATES + 1);
    assert.equal(report.roadmap.candidates.truncated, true);
    assert.equal(report.roadmap.stats.todo, MAX_PROPOSAL_CONTEXT_CANDIDATES + 1);
  } finally {
    fixture.cleanup();
  }
});

test("refuses a roadmap project without an objective source", () => {
  const fixture = setupProject({ "roadmap.md": "- [ ] Work" });
  try {
    const report = generateRoadmapProposalContextReport(
      project(fixture.path, { planning: { mode: "roadmap" } }),
    );

    assert.equal(report.context, null);
    assert.equal(report.objective.reason, "objective_source_not_configured");
    assert.equal("roadmap" in report, false);
  } finally {
    fixture.cleanup();
  }
});

for (const [mode, reason] of [
  ["maintenance", "planning_mode_maintenance"],
  ["deferred", "planning_mode_deferred"],
  ["external", "planning_mode_external"],
] as const) {
  test(`refuses ${mode} without reading an objective`, () => {
    const fixture = setupProject({
      "objective.md": "Canonical objective.",
      "roadmap.md": "- [ ] Work",
    });
    try {
      const report = generateRoadmapProposalContextReport(
        project(fixture.path, {
          planning: { mode, objective_source: "objective.md" },
        }),
      );

      assert.equal(report.context, null);
      assert.equal(report.objective.reason, reason);
    } finally {
      fixture.cleanup();
    }
  });
}

test("propagates an unreadable objective as a deterministic refusal", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": "- [ ] Work",
  });
  const objectivePath = join(fixture.path, "objective.md");
  try {
    chmodSync(objectivePath, 0o000);
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, null);
    assert.equal(report.objective.reason, "objective_source_unreadable");
  } finally {
    chmodSync(objectivePath, 0o644);
    fixture.cleanup();
  }
});

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
import {
  MAX_PROPOSAL_CONTEXT_CANDIDATES,
  MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
  MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS,
  MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
  projectRoadmapProposalCandidate,
  projectRoadmapProposalPhaseGate,
} from "../../src/intelligence/proposal-context.js";

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
    assert.deepEqual(report.project, {
      name: "example",
      nameTruncated: false,
      type: "fixture",
      typeTruncated: false,
    });
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

test("keeps a completed roadmap eligible without sending historical candidates", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": "- [x] Completed milestone",
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.equal(report.roadmap.stats.total, 1);
    assert.equal(report.roadmap.stats.done, 1);
    assert.equal(report.roadmap.stats.todo, 0);
    assert.equal(report.roadmap.summary.selectable, 0);
    assert.equal(report.roadmap.candidates.total, 0);
    assert.equal(report.roadmap.candidates.items.length, 0);
    assert.equal(report.roadmap.candidates.truncated, false);
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
        pathTruncated: false,
        line: 1,
        phaseId: "H4",
        phaseIdTruncated: false,
        state: "closed",
        blockedBy: "retours-terrain-2027",
        blockedByTruncated: false,
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

test("completed history cannot hide a later active candidate or consume the proposal bound", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": [
      ...Array.from(
        { length: MAX_PROPOSAL_CONTEXT_CANDIDATES + 1 },
        (_, index) => `- [x] Historical lot ${index + 1}`,
      ),
      "- [ ] [P1] Active lot after long completed history",
    ].join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.equal(report.roadmap.stats.done, MAX_PROPOSAL_CONTEXT_CANDIDATES + 1);
    assert.equal(report.roadmap.stats.todo, 1);
    assert.equal(report.roadmap.candidates.total, 1);
    assert.equal(report.roadmap.candidates.truncated, false);
    assert.equal(report.roadmap.candidates.items.length, 1);
    assert.equal(report.roadmap.candidates.items[0]?.status, "todo");
    assert.match(
      report.roadmap.candidates.items[0]?.text ?? "",
      /Active lot after long completed history/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("completed history alone never marks proposal candidates as truncated", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": Array.from(
      { length: MAX_PROPOSAL_CONTEXT_CANDIDATES + 20 },
      (_, index) => `- [x] Historical lot ${index + 1}`,
    ).join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));

    assert.equal(report.context, "available");
    assert.equal(report.roadmap.stats.done, MAX_PROPOSAL_CONTEXT_CANDIDATES + 20);
    assert.equal(report.roadmap.candidates.total, 0);
    assert.equal(report.roadmap.candidates.items.length, 0);
    assert.equal(report.roadmap.candidates.truncated, false);
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

test("bounds arbitrary project configuration fields in the available context", () => {
  const fixture = setupProject({
    "objective.md": "Canonical objective.",
    "roadmap.md": "- [ ] Work",
  });
  const oversized = "x".repeat(MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS + 1);
  try {
    const report = generateRoadmapProposalContextReport(
      project(fixture.path, {
        name: oversized,
        type: oversized,
        roadmap: Array.from(
          { length: MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS + 1 },
          (_, index) => `roadmap-${index}.md`,
        ),
        validation: Array.from(
          { length: MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS + 1 },
          () => oversized,
        ),
      }),
    );

    assert.equal(report.context, "available");
    assert.equal(report.project.name.length, MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS);
    assert.equal(report.project.nameTruncated, true);
    assert.equal(report.project.type.length, MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS);
    assert.equal(report.project.typeTruncated, true);
    assert.equal(
      report.roadmap.configuredPaths.length,
      MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
    );
    assert.equal(
      report.roadmap.configuredPathsTotal,
      MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS + 1,
    );
    assert.equal(report.roadmap.configuredPathsTruncated, true);
    assert.equal(
      report.projectState.validation.commands.length,
      MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
    );
    assert.equal(
      report.projectState.validation.commandsTotal,
      MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS + 1,
    );
    assert.equal(report.projectState.validation.commandsTruncated, true);
  } finally {
    fixture.cleanup();
  }
});

test("bounds every roadmap metadata string before it reaches the context", () => {
  const oversized = "x".repeat(MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS + 1);
  const candidate = projectRoadmapProposalCandidate({
    id: oversized,
    phaseId: oversized,
    path: oversized,
    line: 1,
    text: oversized,
    kind: "blocked",
    reason: oversized,
    status: "todo",
    priority: "p1",
    admissibility: {
      state: "not_admissible",
      reason: "phase_closed",
      blockedBy: oversized,
    },
  });
  const phaseGate = projectRoadmapProposalPhaseGate({
    path: oversized,
    line: 2,
    phaseId: oversized,
    state: "closed",
    blockedBy: oversized,
  });

  assert.equal(candidate.id?.length, MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS);
  assert.equal(candidate.idTruncated, true);
  assert.equal(candidate.phaseIdTruncated, true);
  assert.equal(candidate.pathTruncated, true);
  assert.equal(candidate.textTruncated, true);
  assert.equal(candidate.reasonTruncated, true);
  assert.equal(candidate.admissibility?.blockedByTruncated, true);
  assert.equal(phaseGate.pathTruncated, true);
  assert.equal(phaseGate.phaseIdTruncated, true);
  assert.equal(phaseGate.blockedByTruncated, true);
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

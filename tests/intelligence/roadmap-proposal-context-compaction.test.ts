import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import { generateRoadmapProposalContextReport } from "../../src/core/reports.js";
import {
  buildCompactRoadmapProposalContext,
  estimateTokenCount,
} from "../../src/intelligence/roadmap-proposal-context-compaction.js";

function setupProject(files: Readonly<Record<string, string>>): {
  path: string;
  cleanup: () => void;
} {
  const path = join(
    tmpdir(),
    `loop-compaction-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

function project(path: string): ProjectConfig {
  return {
    name: "example",
    path,
    type: "fixture",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap", objective_source: "objective.md" },
    roadmap: ["roadmap.md"],
  };
}

test("filters already-done safe candidates but keeps open and blocked candidates on a mixed roadmap", () => {
  const fixture = setupProject({
    "objective.md": "Ship the cost-aware roadmap proposal routing.",
    "roadmap.md": [
      "- [x] Completed lot one",
      "- [x] Completed lot two",
      "- [x] Completed lot three",
      "- [ ] [P1] Open lot needing attention",
      "<!-- loop-engine:phase-gate phase=H4 state=closed blockedBy=retours-terrain-2027 -->",
      "| H4-L1 | Deferred work | ⬜ À faire |",
    ].join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));
    const compact = buildCompactRoadmapProposalContext(report);

    assert.ok(compact !== null);
    assert.equal(compact.roadmap.stats.done, 3);
    // Only the two non-done-and-safe candidates survive: the open P1 lot and the
    // phase-gate-blocked table row. Verbatim text of the three completed lines
    // is dropped — their count is already carried by stats.done.
    assert.equal(compact.roadmap.candidates.items.length, 2);
    assert.ok(
      compact.roadmap.candidates.items.every((item) => item.status !== "done"),
    );
    assert.equal(compact.roadmap.phaseGatesBlockedCount, 1);

    const fullJson = JSON.stringify(report);
    const compactJson = JSON.stringify(compact);
    assert.ok(
      compactJson.length < fullJson.length,
      `expected compact context (${compactJson.length}b) to be smaller than the full context (${fullJson.length}b)`,
    );
  } finally {
    fixture.cleanup();
  }
});

test("drops all candidates on a fully-done roadmap while preserving the completion count", () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": Array.from(
      { length: 10 },
      (_, index) => `- [x] Lot ${index + 1}`,
    ).join("\n"),
  });
  try {
    const report = generateRoadmapProposalContextReport(project(fixture.path));
    const compact = buildCompactRoadmapProposalContext(report);

    assert.ok(compact !== null);
    assert.equal(compact.roadmap.stats.total, 10);
    assert.equal(compact.roadmap.stats.done, 10);
    assert.equal(compact.roadmap.candidates.items.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("returns null for an unavailable context", () => {
  const compact = buildCompactRoadmapProposalContext({
    context: null,
  } as never);
  assert.equal(compact, null);
});

test("estimateTokenCount is deterministic and scales with byte length", () => {
  const short = estimateTokenCount("{}");
  const long = estimateTokenCount("x".repeat(1000));
  assert.equal(estimateTokenCount("{}"), short);
  assert.ok(long > short);
});

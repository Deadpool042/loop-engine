import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import {
  generateRoadmapCandidateDetailReport,
  generateRoadmapOverviewReport,
} from "../../src/core/reports.js";

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
    assert.equal(report.roadmap.completionEvent?.type, "lot.completed");
    assert.match(report.roadmap.completionEvent?.eventId ?? "", /^[a-f0-9]{32}$/);
    assert.match(
      report.roadmap.completionEvent?.candidate.text ?? "",
      /Delivered lot/,
    );
    assert.match(
      report.roadmap.completionEvent?.nextCandidate?.text ?? "",
      /Next lot/,
    );

    const repeated = generateRoadmapOverviewReport(project(fixture.path));
    assert.equal(
      repeated.roadmap.completionEvent?.eventId,
      report.roadmap.completionEvent?.eventId,
    );
  } finally {
    fixture.cleanup();
  }
});

test("does not fabricate a completion event before the first lot is completed", () => {
  const fixture = setupProject(
    [
      "- [ ] [P1] First lot",
      "- [ ] [P2] Later lot",
    ].join("\n"),
  );

  try {
    const report = generateRoadmapOverviewReport(project(fixture.path));

    assert.equal(report.roadmap.completionEvent, null);
    assert.match(report.roadmap.selectedCandidate?.text ?? "", /First lot/);
  } finally {
    fixture.cleanup();
  }
});

test("exposes candidate detail keys and resolves a requested candidate without caller paths", () => {
  const fixture = setupProject(
    [
      "⏳ [P1] VNEXT3-G1 — Social drafts admin",
      "- [ ] [P1] VNEXT3-G2 — Wishlist V2",
    ].join("\n"),
  );

  try {
    writeFileSync(
      join(fixture.path, "cycle.md"),
      [
        "# Cycle",
        "",
        "## VNEXT3-G1 — Social drafts admin",
        "",
        "### État observé",
        "",
        "Code livré.",
        "",
        "### Critère restant",
        "",
        "Recette UI staging.",
        "",
        "## VNEXT3-G2 — Wishlist V2",
        "",
        "### Objectif V1",
        "",
        "Persister les favoris authentifiés.",
      ].join("\n"),
    );

    const overview = generateRoadmapOverviewReport(project(fixture.path));
    const first = overview.roadmap.candidates.items[0];
    const second = overview.roadmap.candidates.items[1];

    assert.equal(first?.id, "VNEXT3-G1");
    assert.equal(second?.id, "VNEXT3-G2");
    assert.match(first?.detailKey ?? "", /^[a-f0-9]{32}$/);
    assert.match(second?.detailKey ?? "", /^[a-f0-9]{32}$/);
    assert.notEqual(first?.detailKey, second?.detailKey);

    const detail = generateRoadmapCandidateDetailReport(
      project(fixture.path),
      first!.detailKey,
    );

    assert.equal(detail.status, "ok");
    if (detail.status !== "ok") return;
    assert.equal(detail.detail.path, "cycle.md");
    assert.equal(detail.detail.title, "VNEXT3-G1 — Social drafts admin");
    assert.deepEqual(
      detail.detail.sections.map((section) => section.kind),
      ["status", "acceptance"],
    );

    const missing = generateRoadmapCandidateDetailReport(
      project(fixture.path),
      "0".repeat(32),
    );
    assert.equal(missing.status, "not_found");
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

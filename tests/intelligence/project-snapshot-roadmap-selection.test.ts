import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { type ProjectConfig } from "../../src/core/config.js";
import { buildProjectSnapshot } from "../../src/intelligence/project-snapshot.js";

function setupProject(roadmap: string): {
  project: ProjectConfig;
  cleanup: () => void;
} {
  const projectPath = mkdtempSync(join(tmpdir(), "loop-snapshot-roadmap-"));
  writeFileSync(join(projectPath, "roadmap.md"), roadmap);

  return {
    project: {
      name: "snapshot-roadmap-fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    },
    cleanup: () => rmSync(projectPath, { recursive: true, force: true }),
  };
}

describe("project snapshot roadmap selection", () => {
  it("ignores descriptive roadmap bullets after completed candidates", () => {
    const { project, cleanup } = setupProject(
      [
        "- [x] Burn-in 1 — completed",
        "- [x] Burn-in 2 — completed",
        "- Aucun nouveau lot V15+ avant plusieurs exécutions réelles réussies du pilote.",
      ].join("\n"),
    );

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.done, 2);
      assert.equal(snapshot.roadmap.stats.unknown, 0);
      assert.equal(snapshot.roadmap.summary.active, 0);
      assert.equal(snapshot.roadmap.summary.selectable, 0);
      assert.equal(snapshot.roadmap.selectedCandidate, null);
    } finally {
      cleanup();
    }
  });

  it("continues to select explicit todo candidates", () => {
    const { project, cleanup } = setupProject(
      [
        "- Statut : le lot historique est clôturé.",
        "- [ ] [P1] Ajouter le prochain burn-in contrôlé",
      ].join("\n"),
    );

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.unknown, 0);
      assert.equal(snapshot.roadmap.summary.selectable, 1);
      assert.equal(snapshot.roadmap.selectedCandidate?.status, "todo");
      assert.equal(snapshot.roadmap.selectedCandidate?.priority, "p1");
      assert.match(
        snapshot.roadmap.selectedCandidate?.text ?? "",
        /Ajouter le prochain burn-in contrôlé/,
      );
    } finally {
      cleanup();
    }
  });

  it("keeps closed-phase todo candidates in inventory without selecting them", () => {
    const { project, cleanup } = setupProject(
      [
        "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
        "| H1-L4 | Runbook rollback | ⬜ À faire |",
      ].join("\n"),
    );

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.todo, 1);
      assert.equal(snapshot.roadmap.summary.selectable, 0);
      assert.equal(snapshot.roadmap.selectedCandidate, null);
      assert.deepEqual(snapshot.roadmap.candidates[0]?.admissibility, {
        state: "not_admissible",
        reason: "phase_closed",
        blockedBy: "H0-RC",
      });
      assert.deepEqual(snapshot.roadmap.phaseGates, [
        {
          path: "roadmap.md",
          line: 1,
          phaseId: "H1",
          state: "closed",
          blockedBy: "H0-RC",
        },
      ]);
    } finally {
      cleanup();
    }
  });

  it("does not skip a gated first lot to select later admissible work", () => {
    const { project, cleanup } = setupProject(
      [
        "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
        "| H1-L1 | Current gated lot | ⬜ À faire |",
        "| H2-L1 | Later admissible lot | ⬜ À faire |",
      ].join("\n"),
    );

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.todo, 2);
      assert.equal(snapshot.roadmap.summary.selectable, 0);
      assert.equal(snapshot.roadmap.selectedCandidate, null);
      assert.equal(snapshot.planning.recommendation, "gated_no_work");
      assert.equal(snapshot.roadmap.candidates[1]?.admissibility?.state, "admissible");
    } finally {
      cleanup();
    }
  });

  it("selects the first remaining structured-table lot", () => {
    const currentDir = fileURLToPath(new URL(".", import.meta.url));
    const roadmap = readFileSync(
      join(currentDir, "..", "fixtures", "roadmaps", "structured-lots-table.md"),
      "utf8",
    );
    const { project, cleanup } = setupProject(roadmap);

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.total, 26);
      assert.equal(snapshot.roadmap.stats.done, 10);
      assert.equal(snapshot.roadmap.stats.todo, 16);
      assert.equal(snapshot.roadmap.stats.unknown, 0);
      assert.equal(snapshot.roadmap.summary.selectable, 1);
      assert.match(snapshot.roadmap.selectedCandidate?.text ?? "", /H1-L4/);
      assert.equal(snapshot.roadmap.selectedCandidate?.status, "todo");
      assert.deepEqual(snapshot.roadmap.selectedCandidate?.admissibility, {
        state: "admissible",
        reason: "no_phase_gate",
      });
    } finally {
      cleanup();
    }
  });
});

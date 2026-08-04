import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

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
  it("keeps unknown roadmap entries in inventory but never selects them as the next action", () => {
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
      assert.equal(snapshot.roadmap.stats.unknown, 1);
      assert.equal(snapshot.roadmap.summary.active, 1);
      assert.equal(snapshot.roadmap.summary.selectable, 0);
      assert.equal(snapshot.roadmap.selectedCandidate, null);
    } finally {
      cleanup();
    }
  });

  it("continues to select explicit todo candidates", () => {
    const { project, cleanup } = setupProject(
      [
        "- Une phrase de prose contenant le mot lot historique.",
        "- [ ] [P1] Ajouter le prochain burn-in contrôlé",
      ].join("\n"),
    );

    try {
      const snapshot = buildProjectSnapshot(project);

      assert.equal(snapshot.roadmap.stats.unknown, 1);
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
});

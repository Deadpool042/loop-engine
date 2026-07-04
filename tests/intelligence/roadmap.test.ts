import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import {
  findRoadmapCandidates,
  selectRoadmapCandidate,
  type RoadmapCandidate,
} from "../../src/intelligence/roadmap.js";

function candidate(kind: RoadmapCandidate["kind"], text: string): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text,
    kind,
    reason: kind === "safe" ? "no sensitive keyword detected" : `contains "${text}"`,
    status: "unknown",
  };
}

function setupRoadmap(content: string): {
  project: ProjectConfig;
  projectPath: string;
  cleanup: () => void;
} {
  const projectPath = mkdtempSync(join(tmpdir(), "loop-roadmap-"));
  const roadmapPath = "roadmap.md";

  writeFileSync(join(projectPath, roadmapPath), content);

  return {
    project: {
      name: "test",
      path: ".",
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: [roadmapPath],
    },
    projectPath,
    cleanup: () => rmSync(projectPath, { recursive: true, force: true }),
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


  it("ignores done candidates when selecting the next roadmap candidate", () => {
    const selected = selectRoadmapCandidate([
      {
        ...candidate("safe", "done docs update"),
        status: "done",
      },
      {
        ...candidate("warning", "bascule DNS"),
        status: "todo",
      },
    ]);

    assert.equal(selected?.kind, "warning");
    assert.equal(selected?.status, "todo");
  });

  it("returns null when no candidate exists", () => {
    const selected = selectRoadmapCandidate([]);

    assert.equal(selected, null);
  });
});

describe("findRoadmapCandidates", () => {
  it("classifies safe roadmap candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Petite mise à jour documentation",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.kind, "safe");
      assert.equal(candidates[0]?.reason, "no sensitive keyword detected");
    } finally {
      cleanup();
    }
  });

  it("classifies warning roadmap candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Préparer la bascule DNS",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.kind, "warning");
      assert.equal(candidates[0]?.reason, 'contains "dns"');
    } finally {
      cleanup();
    }
  });


  it("does not block generic product wording", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Ajouter une fiche produit simple",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.kind, "safe");
      assert.equal(candidates[0]?.reason, "no sensitive keyword detected");
    } finally {
      cleanup();
    }
  });

  it("blocks explicit production rollout wording", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Préparer la mise en production",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.kind, "blocked");
      assert.equal(candidates[0]?.reason, 'contains "mise en production"');
    } finally {
      cleanup();
    }
  });

  it("classifies blocked roadmap candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Bascule production finale creatyss.com",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.kind, "blocked");
      assert.equal(candidates[0]?.reason, 'contains "production finale"');
    } finally {
      cleanup();
    }
  });
});

describe("roadmap candidate status", () => {
  it("detects todo candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Ajouter une page admin",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.status, "todo");
    } finally {
      cleanup();
    }
  });

  it("detects done candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [x] Ajouter une page admin",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.status, "done");
    } finally {
      cleanup();
    }
  });

  it("detects in progress candidates", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "⏳ En cours — stabilisation roadmap",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.status, "in_progress");
    } finally {
      cleanup();
    }
  });

  it("uses unknown status when no status marker is found", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "Lot 12 — Stabilisation roadmap",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.status, "unknown");
    } finally {
      cleanup();
    }
  });
});

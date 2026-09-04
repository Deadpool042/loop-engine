import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { type ProjectConfig } from "../../src/core/config.js";
import {
  analyzeRoadmaps,
  findRoadmapCandidates,
  selectRoadmapCandidate,
  type RoadmapCandidate,
} from "../../src/intelligence/roadmap.js";

function candidate(
  kind: RoadmapCandidate["kind"],
  text: string,
): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text,
    kind,
    reason:
      kind === "safe" ? "no sensitive keyword detected" : `contains "${text}"`,
    status: "unknown",
    priority: "default",
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

  it("prefers higher priority within the same kind", () => {
    const selected = selectRoadmapCandidate([
      {
        ...candidate("safe", "default safe"),
        priority: "default",
      },
      {
        ...candidate("safe", "p2 safe"),
        priority: "p2",
      },
      {
        ...candidate("safe", "p1 safe"),
        priority: "p1",
      },
    ]);

    assert.equal(selected?.priority, "p1");
    assert.equal(selected?.text, "p1 safe");
  });

  it("does not let warning p1 beat safe default", () => {
    const selected = selectRoadmapCandidate([
      {
        ...candidate("warning", "p1 warning"),
        priority: "p1",
      },
      {
        ...candidate("safe", "default safe"),
        priority: "default",
      },
    ]);

    assert.equal(selected?.kind, "safe");
    assert.equal(selected?.priority, "default");
  });

  it("does not let blocked p1 beat warning default", () => {
    const selected = selectRoadmapCandidate([
      {
        ...candidate("blocked", "p1 blocked"),
        priority: "p1",
      },
      {
        ...candidate("warning", "default warning"),
        priority: "default",
      },
    ]);

    assert.equal(selected?.kind, "warning");
    assert.equal(selected?.priority, "default");
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
  it("keeps a todo table lot while recording a closed phase gate as non-admissible", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
        "| H1-L4 | Runbook rollback | ⬜ À faire |",
      ].join("\n"),
    );

    try {
      const analysis = analyzeRoadmaps(project, projectPath);

      assert.deepEqual(analysis.phaseGates, [
        {
          path: "roadmap.md",
          line: 1,
          phaseId: "H1",
          state: "closed",
          blockedBy: "H0-RC",
        },
      ]);
      assert.equal(analysis.candidates[0]?.status, "todo");
      assert.equal(analysis.candidates[0]?.phaseId, "H1");
      assert.deepEqual(analysis.candidates[0]?.admissibility, {
        state: "not_admissible",
        reason: "phase_closed",
        blockedBy: "H0-RC",
      });
    } finally {
      cleanup();
    }
  });

  it("accepts an explicitly open phase and leaves roadmaps without gates unchanged", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "<!-- loop-engine:phase-gate phase=H1 state=open -->",
        "| H1-L4 | Explicitly opened | ⬜ À faire |",
        "| H2-L1 | Historical default | ⬜ À faire |",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.deepEqual(candidates[0]?.admissibility, {
        state: "admissible",
        reason: "phase_open",
      });
      assert.deepEqual(candidates[1]?.admissibility, {
        state: "admissible",
        reason: "no_phase_gate",
      });
    } finally {
      cleanup();
    }
  });

  it("fails closed when a phase gate declaration is invalid or ambiguous", () => {
    const cases = [
      {
        name: "invalid",
        roadmap: [
          "<!-- loop-engine:phase-gate phase=H1 state=closed -->",
          "| H1-L4 | Pending | ⬜ À faire |",
        ].join("\n"),
      },
      {
        name: "ambiguous",
        roadmap: [
          "<!-- loop-engine:phase-gate phase=H1 state=open -->",
          "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
          "| H1-L4 | Pending | ⬜ À faire |",
        ].join("\n"),
      },
    ] as const;

    for (const testCase of cases) {
      const { project, projectPath, cleanup } = setupRoadmap(testCase.roadmap);
      try {
        const candidate = findRoadmapCandidates(project, projectPath)[0];
        assert.deepEqual(
          candidate?.admissibility,
          {
            state: "not_admissible",
            reason: "phase_gate_invalid",
          },
          testCase.name,
        );
      } finally {
        cleanup();
      }
    }
  });

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

describe("roadmap structured markdown tables", () => {
  it("recognizes lot rows and their explicit status without inventorying descriptive bullets", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(
      resolve(
        currentDir,
        "..",
        "fixtures",
        "roadmaps",
        "structured-lots-table.md",
      ),
      "utf8",
    );
    const { project, projectPath, cleanup } = setupRoadmap(content);

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 26);
      assert.equal(
        candidates.filter((candidate) => candidate.status === "done").length,
        10,
      );
      assert.equal(
        candidates.filter((candidate) => candidate.status === "todo").length,
        16,
      );
      assert.equal(
        candidates.filter((candidate) => candidate.status === "unknown").length,
        0,
      );
      assert.match(candidates[9]?.text ?? "", /H1-L3B/);
      assert.equal(candidates[9]?.status, "done");
      assert.match(candidates[10]?.text ?? "", /H1-L4/);
      assert.equal(candidates[10]?.status, "todo");
    } finally {
      cleanup();
    }
  });

  it("keeps an unrecognized table state explicit as unknown", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "| Lot | Deliverable | State |",
        "| --- | --- | --- |",
        "| H6-L1 | Future work | Pending review |",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.status, "unknown");
    } finally {
      cleanup();
    }
  });
});

describe("roadmap markdown headings", () => {
  it("ignores a markdown heading even when it contains a candidate keyword", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "## Lot actif — burn-in vertical",
        "- [ ] Burn-in 1 — Exécuter le chemin CLI -> provider -> worktree -> validation",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 1);
      assert.equal(
        candidates[0]?.text,
        "- [ ] Burn-in 1 — Exécuter le chemin CLI -> provider -> worktree -> validation",
      );
    } finally {
      cleanup();
    }
  });

  it("ignores markdown headings of any level", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      ["# Titre", "## Section", "### Sous-section Lot"].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 0);
    } finally {
      cleanup();
    }
  });

  it("still selects the real task, not the section title, as the active candidate", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "## Lot actif — burn-in vertical",
        "- [ ] Burn-in 1 — Exécuter le chemin CLI -> provider -> worktree -> validation",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);
      const selected = selectRoadmapCandidate(candidates);

      assert.equal(selected?.status, "todo");
      assert.equal(
        selected?.text,
        "- [ ] Burn-in 1 — Exécuter le chemin CLI -> provider -> worktree -> validation",
      );
    } finally {
      cleanup();
    }
  });

  it("does not turn a completed - [x] line into an active candidate", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [x] Tâche déjà terminée",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);
      const selected = selectRoadmapCandidate(candidates);

      assert.equal(candidates[0]?.status, "done");
      assert.equal(selected, null);
    } finally {
      cleanup();
    }
  });

  it("keeps existing marker behavior unchanged", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      ["TODO Nettoyer le module X", "Prochain lot — stabilisation"].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates.length, 2);
    } finally {
      cleanup();
    }
  });
});

describe("roadmap candidate priority", () => {
  it("detects p1 priority", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] [P1] Corriger le parser roadmap",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.priority, "p1");
    } finally {
      cleanup();
    }
  });

  it("detects p2 priority with spaces and lowercase", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] [ p2 ] Améliorer le résumé CLI",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.priority, "p2");
    } finally {
      cleanup();
    }
  });

  it("detects p3 priority", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] [P3] Nettoyer la documentation",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.priority, "p3");
    } finally {
      cleanup();
    }
  });

  it("uses default priority when no priority marker is found", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      "- [ ] Nettoyer la documentation",
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);

      assert.equal(candidates[0]?.priority, "default");
    } finally {
      cleanup();
    }
  });
});

describe("execution projection contract", () => {
  it("returns no candidate when the projection declares no actionable code", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "# Projection d’exécution — Loop Engine",
        "",
        "État : `NO_ACTIONABLE_CODE`.",
        "",
        "Aucun lot Code n’est actionnable par défaut.",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);
      const selected = selectRoadmapCandidate(candidates);

      assert.equal(candidates.length, 0);
      assert.equal(selected, null);
    } finally {
      cleanup();
    }
  });

  it("exposes a revalidated structured lot as an addressable candidate", () => {
    const { project, projectPath, cleanup } = setupRoadmap(
      [
        "# Projection d’exécution — Loop Engine",
        "",
        "| Lot | Livrable | État |",
        "| --- | --- | --- |",
        "| H4-L12 | Corriger un lot réel revalidé | ⬜ À faire |",
      ].join("\n"),
    );

    try {
      const candidates = findRoadmapCandidates(project, projectPath);
      const selected = selectRoadmapCandidate(candidates);

      assert.equal(candidates.length, 1);
      assert.equal(selected?.id, "H4-L12");
      assert.equal(selected?.status, "todo");
      assert.equal(selected?.kind, "safe");
    } finally {
      cleanup();
    }
  });
});

describe("loop-engine roadmap state", () => {
  it("keeps historical delivered lots through V43 done and leaves no active candidate", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(currentDir, "..", "..");
    const project: ProjectConfig = {
      name: "loop-engine",
      path: ".",
      type: "node-cli",
      required_docs: ["README.md", "docs/architecture/project-intelligence.md"],
      validation: ["pnpm run validate"],
      roadmap: ["docs/roadmap/loop-engine.md"],
    };

    const candidates = findRoadmapCandidates(project, repoRoot);
    const burnInCandidates = candidates.filter((candidate) =>
      /Burn-in 1|Burn-in 2/.test(candidate.text),
    );
    const v23Candidates = candidates.filter((candidate) =>
      /Lot V23\.[01]/.test(candidate.text),
    );
    const v25Candidates = candidates.filter((candidate) =>
      /V25\.0/.test(candidate.text),
    );
    const jp1Candidates = candidates.filter((candidate) =>
      /Lot JP1/.test(candidate.text),
    );
    const jp2Candidates = candidates.filter((candidate) =>
      /Lot JP2/.test(candidate.text),
    );

    assert.ok(
      burnInCandidates.every((candidate) => candidate.status === "done"),
      "expected both burn-in lots to be marked done in the roadmap",
    );
    assert.equal(v23Candidates.length, 2);
    assert.ok(
      v23Candidates.every((candidate) => candidate.status === "done"),
      "expected V23.0 and V23.1 to remain done after real burn-in qualification",
    );
    assert.ok(v25Candidates.length >= 1);
    assert.ok(
      v25Candidates.every((candidate) => candidate.status === "done"),
      "expected every parsed V25.0 candidate marker to be completed",
    );
    assert.ok(jp1Candidates.length >= 1);
    assert.ok(
      jp1Candidates.every((candidate) => candidate.status === "done"),
      "expected JP1 to be marked done in the roadmap",
    );
    assert.ok(jp2Candidates.length >= 1);
    assert.ok(
      jp2Candidates.every((candidate) => candidate.status === "done"),
      "expected JP2 to be marked done in the roadmap",
    );

    const v40Candidates = candidates.filter((candidate) =>
      /V40\.[0-3]/.test(candidate.text),
    );
    assert.equal(v40Candidates.length, 4);
    assert.ok(
      v40Candidates.every((candidate) => candidate.status === "done"),
      "expected V40.0 through V40.3 to be marked done in the roadmap",
    );

    const v43Candidates = candidates.filter((candidate) =>
      /V43\.0/.test(candidate.text),
    );
    assert.equal(v43Candidates.length, 1);
    assert.equal(v43Candidates[0]?.status, "done");

    const activeCandidates = candidates.filter(
      (candidate) => candidate.status !== "done",
    );
    assert.equal(activeCandidates.length, 0);

    const selected = selectRoadmapCandidate(candidates);
    assert.equal(selected, null);
  });
});

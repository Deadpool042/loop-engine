import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import {
  findRoadmapCandidates,
  selectRoadmapCandidate,
} from "../../src/intelligence/roadmap.js";

function withRoadmap(
  content: string,
  run: (project: ProjectConfig, projectPath: string) => void,
): void {
  const projectPath = mkdtempSync(join(tmpdir(), "loop-roadmap-content-"));
  const roadmapPath = "roadmap.md";

  writeFileSync(join(projectPath, roadmapPath), content);

  const project: ProjectConfig = {
    name: "test",
    path: ".",
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: [roadmapPath],
  };

  try {
    run(project, projectPath);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
}

describe("roadmap candidate content", () => {
  it("captures indented continuation lines in the selected candidate", () => {
    withRoadmap(
      [
        "- [ ] [P1] Créer le fichier cible",
        "  Le fichier doit être docs/result.md.",
        "  Il doit contenir exactement la preuve attendue.",
      ].join("\n"),
      (project, projectPath) => {
        const selected = selectRoadmapCandidate(
          findRoadmapCandidates(project, projectPath),
        );

        assert.equal(
          selected?.text,
          "- [ ] [P1] Créer le fichier cible Le fichier doit être docs/result.md. Il doit contenir exactement la preuve attendue.",
        );
        assert.equal(selected?.line, 1);
        assert.equal(selected?.priority, "p1");
        assert.equal(selected?.status, "todo");
      },
    );
  });

  it("uses continuation content for safety classification", () => {
    withRoadmap(
      [
        "- [ ] Préparer la prochaine opération",
        "  Effectuer ensuite la mise en production.",
      ].join("\n"),
      (project, projectPath) => {
        const [candidate] = findRoadmapCandidates(project, projectPath);

        assert.equal(candidate?.kind, "blocked");
        assert.equal(candidate?.reason, 'contains "mise en production"');
      },
    );
  });

  it("stops before the next candidate and keeps both candidates distinct", () => {
    withRoadmap(
      [
        "- [ ] Premier lot",
        "  Créer docs/first.md.",
        "- [ ] Deuxième lot",
        "  Créer docs/second.md.",
      ].join("\n"),
      (project, projectPath) => {
        const candidates = findRoadmapCandidates(project, projectPath);

        assert.equal(candidates.length, 2);
        assert.equal(
          candidates[0]?.text,
          "- [ ] Premier lot Créer docs/first.md.",
        );
        assert.equal(
          candidates[1]?.text,
          "- [ ] Deuxième lot Créer docs/second.md.",
        );
        assert.equal(candidates[1]?.line, 3);
      },
    );
  });

  it("does not absorb unindented prose after a candidate", () => {
    withRoadmap(
      [
        "- [ ] Créer docs/result.md",
        "Cette phrase décrit une autre section.",
      ].join("\n"),
      (project, projectPath) => {
        const [candidate] = findRoadmapCandidates(project, projectPath);

        assert.equal(candidate?.text, "- [ ] Créer docs/result.md");
      },
    );
  });

  it("does not create a duplicate candidate from a continuation containing lot", () => {
    withRoadmap(
      [
        "- [ ] Stabiliser le parser",
        "  Le prochain lot doit rester dans ce candidat.",
      ].join("\n"),
      (project, projectPath) => {
        const candidates = findRoadmapCandidates(project, projectPath);

        assert.equal(candidates.length, 1);
        assert.match(candidates[0]?.text ?? "", /prochain lot/);
      },
    );
  });
});

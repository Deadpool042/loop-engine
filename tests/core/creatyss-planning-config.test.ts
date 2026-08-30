import assert from "node:assert/strict";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadConfig } from "../../src/core/config.js";
import { discoverConventionalRoadmaps } from "../../src/intelligence/planning.js";
import { analyzeRoadmaps } from "../../src/intelligence/roadmap.js";

function findCreatyss() {
  const config = loadConfig();
  const creatyss = config.projects.find((p) => p.name === "creatyss");
  assert.ok(creatyss, "creatyss must be configured in projects.yaml");
  return creatyss!;
}

test("creatyss no longer references the obsolete docs/roadmap/loop-engine.md source", () => {
  const creatyss = findCreatyss();

  assert.ok(
    !creatyss.required_docs.includes("docs/roadmap/loop-engine.md"),
    "required_docs must not reference the retired roadmap file",
  );
  assert.ok(
    !(creatyss.roadmap ?? []).includes("docs/roadmap/loop-engine.md"),
    "roadmap paths must not reference the retired roadmap file",
  );
});

test("creatyss roadmap is anchored on the real active index and its linked active sub-roadmaps", () => {
  const creatyss = findCreatyss();
  const roadmap = creatyss.roadmap ?? [];

  assert.ok(roadmap.includes("docs/roadmap/README.md"));
  for (const path of [
    "docs/roadmap/h1-boutique-vendable/README.md",
    "docs/roadmap/h2-commerce-fiable/README.md",
    "docs/roadmap/h3-administration-avancee/README.md",
    "docs/roadmap/h4-plateforme-automatisation/README.md",
    "docs/roadmap/gestion-contenu-admin-hygiene/README.md",
    "docs/roadmap/editorial-marketing-intents/README.md",
  ]) {
    assert.ok(roadmap.includes(path), `expected ${path} to be configured`);
  }

  assert.equal(new Set(roadmap).size, roadmap.length, "no duplicate roadmap paths");
});

test("creatyss has an explicit, project-relative objective_source", () => {
  const creatyss = findCreatyss();

  assert.equal(creatyss.planning?.mode, "roadmap");
  assert.equal(creatyss.planning?.objective_source, "docs/objectif-produit.md");
});

test("a project configuring docs/roadmap/README.md is not re-flagged as a discovered roadmap to connect", () => {
  const path = join(
    tmpdir(),
    `loop-creatyss-discover-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(join(path, "docs/roadmap"), { recursive: true });
  writeFileSync(join(path, "docs/roadmap/README.md"), "# Roadmap\n");

  try {
    const discovered = discoverConventionalRoadmaps(path, [
      "docs/roadmap/README.md",
    ]);
    assert.deepEqual(discovered, []);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test("closed-chantier prose (e.g. a clôturé reviews chantier) does not resurrect a false todo candidate", () => {
  const path = join(
    tmpdir(),
    `loop-creatyss-reviews-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const roadmapPath = "docs/roadmap/README.md";
  mkdirSync(join(path, "docs/roadmap"), { recursive: true });
  writeFileSync(
    join(path, roadmapPath),
    [
      "# Roadmap",
      "",
      "Le chantier `reviews` (Avis clients) est clôturé : socle métier, soumission client,",
      "modération admin et affichage storefront sont livrés sur `main`.",
      "Il n'existe plus de lot `reviews` actif dans la roadmap.",
      "",
    ].join("\n"),
  );

  const project = {
    name: "example",
    path,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: [roadmapPath],
  };

  const analysis = analyzeRoadmaps(project, path);
  const reviewsCandidates = analysis.candidates.filter((candidate) =>
    candidate.text.toLowerCase().includes("reviews"),
  );

  assert.deepEqual(reviewsCandidates, []);
});

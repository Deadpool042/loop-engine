import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  resolveRoadmapCandidateDetail,
  resolveSelectedLotDetail,
  resolveSelectedLotWritablePaths,
} from "../../src/core/selected-lot-detail.js";

describe("selected lot detail", () => {
  it("resolves and structures the markdown linked by the selected candidate", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap", "h4");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# H4\n");
      writeFileSync(
        join(roadmapDir, "lot-ai.md"),
        [
          "# Lot — IA back-office V1",
          "",
          "## Objectif",
          "",
          "Assister l'administrateur.",
          "",
          "## Critères de fin",
          "",
          "- suggestion générée",
          "- validation humaine",
        ].join("\n"),
      );

      const detail = resolveSelectedLotDetail(root, {
        path: "docs/roadmap/h4/README.md",
        text: "- [ ] [P2] IA back-office V1 : [`lot-ai.md`](./lot-ai.md).",
      });

      assert.ok(detail);
      assert.equal(detail.path, "docs/roadmap/h4/lot-ai.md");
      assert.equal(detail.title, "Lot — IA back-office V1");
      assert.deepEqual(
        detail.sections.map((section) => section.title),
        ["Objectif", "Critères de fin"],
      );
      assert.match(detail.sections[0]?.content ?? "", /Assister l'administrateur/);
      assert.equal(detail.truncated, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a linked markdown target outside the project root", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# Roadmap\n");

      const detail = resolveSelectedLotDetail(root, {
        path: "docs/roadmap/README.md",
        text: "- [ ] Lot : [outside](../../../outside.md)",
      });

      assert.equal(detail, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a symlinked detail target that resolves outside the project root", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    const outside = mkdtempSync(join(tmpdir(), "loop-selected-lot-outside-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# Roadmap\n");
      writeFileSync(join(outside, "outside.md"), "# Outside\n\n## Objectif\n\nSecret.\n");
      symlinkSync(join(outside, "outside.md"), join(roadmapDir, "lot.md"));

      const detail = resolveSelectedLotDetail(root, {
        path: "docs/roadmap/README.md",
        text: "- [ ] Lot : [detail](./lot.md)",
      });

      assert.equal(detail, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("scopes an explicitly linked shared cycle document to the exact candidate heading", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# Roadmap\n");
      writeFileSync(
        join(roadmapDir, "cycle.md"),
        [
          "# Cycle",
          "",
          "## V51.0 — Previous lot",
          "",
          "### Périmètre d’écriture",
          "",
          "- `docs/previous.md`",
          "- `docs/roadmap/README.md`",
          "",
          "## V51.1 — Burn-in",
          "",
          "### Objectif",
          "",
          "Prouver la continuation.",
          "",
          "### Périmètre d’écriture",
          "",
          "- `docs/audits/burnin.md`",
          "- `docs/roadmap/README.md`",
          "",
          "### Hors périmètre",
          "",
          "- Aucun déploiement.",
        ].join("\n"),
      );

      const detail = resolveRoadmapCandidateDetail(root, {
        id: "V51.1",
        path: "docs/roadmap/README.md",
        text: "- [ ] V51.1 — Burn-in. [Détail](./cycle.md)",
      });

      assert.ok(detail);
      assert.equal(detail.title, "V51.1 — Burn-in");
      assert.deepEqual(
        resolveSelectedLotWritablePaths(detail, "docs/roadmap/README.md"),
        ["docs/audits/burnin.md", "docs/roadmap/README.md"],
      );
      assert.doesNotMatch(
        detail.sections.map((section) => section.content).join("\n"),
        /previous\.md/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves a bounded same-directory heading when the candidate has a stable id", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# Roadmap\n");
      writeFileSync(
        join(roadmapDir, "cycle.md"),
        [
          "# Cycle",
          "",
          "## VNEXT3-G1 — Social drafts admin",
          "",
          "### État observé",
          "",
          "Code livré, recette UI manquante.",
          "",
          "### Objectif V1",
          "",
          "Rendre les brouillons sociaux exploitables.",
          "",
          "### Critère restant",
          "",
          "Recette UI staging.",
          "",
          "## VNEXT3-G2 — Autre lot",
          "",
          "Ne doit pas être inclus.",
        ].join("\n"),
      );

      const detail = resolveRoadmapCandidateDetail(root, {
        id: "VNEXT3-G1",
        path: "docs/roadmap/README.md",
        text: "⏳ [P1] VNEXT3-G1 — Social drafts admin",
      });

      assert.ok(detail);
      assert.equal(detail.path, "docs/roadmap/cycle.md");
      assert.equal(detail.title, "VNEXT3-G1 — Social drafts admin");
      assert.deepEqual(
        detail.sections.map((section) => section.title),
        ["État observé", "Objectif V1", "Critère restant"],
      );
      assert.deepEqual(
        detail.sections.map((section) => section.kind),
        ["status", "objective", "acceptance"],
      );
      assert.doesNotMatch(
        detail.sections.map((section) => section.content).join("\n"),
        /Autre lot/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts only an explicit deterministic writable scope that includes the roadmap source", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      const roadmapDir = join(root, "docs", "roadmap");
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(join(roadmapDir, "README.md"), "# Roadmap\n");
      writeFileSync(
        join(roadmapDir, "lot.md"),
        [
          "# Lot",
          "",
          "## Objectif",
          "",
          "Produire une preuve bornée.",
          "",
          "## Périmètre d’écriture",
          "",
          "- `docs/audits/proof.md`",
          "- `docs/roadmap/README.md`",
        ].join("\n"),
      );

      const detail = resolveSelectedLotDetail(root, {
        path: "docs/roadmap/README.md",
        text: "- [ ] H1-L1 — Lot. [Détail](./lot.md)",
      });

      assert.ok(detail);
      assert.equal(
        detail.sections.find((section) => section.kind === "write_scope")?.title,
        "Périmètre d’écriture",
      );
      assert.deepEqual(
        resolveSelectedLotWritablePaths(detail, "docs/roadmap/README.md"),
        ["docs/audits/proof.md", "docs/roadmap/README.md"],
      );
      assert.equal(
        resolveSelectedLotWritablePaths(detail, "docs/roadmap/other.md"),
        null,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when the candidate has no linked markdown detail", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-selected-lot-"));
    try {
      assert.equal(
        resolveSelectedLotDetail(root, {
          path: "docs/roadmap/README.md",
          text: "- [ ] Lot sans document lié",
        }),
        null,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

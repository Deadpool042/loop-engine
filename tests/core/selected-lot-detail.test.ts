import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { resolveSelectedLotDetail } from "../../src/core/selected-lot-detail.js";

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

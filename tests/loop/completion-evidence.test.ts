import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import { inspectCompletionEvidenceGate } from "../../src/loop/completion-evidence.js";

function fixtureCandidate(text: string): RoadmapCandidate {
  return {
    id: "VNEXT4-S6A",
    path: "docs/roadmap/README.md",
    line: 1,
    text,
    kind: "safe",
    reason: "fixture",
    status: "todo",
    priority: "p1",
  };
}

describe("completion evidence gate", () => {
  it("does nothing when the candidate has no explicit completion-evidence contract", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-evidence-none-"));
    try {
      const result = inspectCompletionEvidenceGate(
        root,
        fixtureCandidate("- [ ] VNEXT4-S6A — simple lot"),
      );
      assert.deepEqual(result, { status: "none" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires unresolved checklist evidence before completion repair", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-evidence-required-"));
    try {
      mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
      mkdirSync(join(root, "docs", "testing"), { recursive: true });
      writeFileSync(
        join(root, "docs", "roadmap", "detail.md"),
        [
          "# Detail",
          "<!-- loop-engine:completion-evidence kind=checklist path=../testing/evidence.md -->",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "docs", "testing", "evidence.md"),
        [
          "# Evidence",
          "| Test | Preuve | Verdict |",
          "| --- | --- | --- |",
          "| A01 | À renseigner | ☐ |",
          "- [ ] validation visuelle",
        ].join("\n"),
      );

      const result = inspectCompletionEvidenceGate(
        root,
        fixtureCandidate("- [ ] VNEXT4-S6A — [detail](./detail.md)"),
      );

      assert.equal(result.status, "required");
      if (result.status !== "required") return;
      assert.equal(result.reason, "unresolved_checklist");
      assert.equal(result.detailPath, "docs/roadmap/detail.md");
      assert.equal(result.evidencePath, "docs/testing/evidence.md");
      assert.equal(result.unresolvedCount, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows completion repair once the declared checklist evidence is resolved", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-evidence-satisfied-"));
    try {
      mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
      mkdirSync(join(root, "docs", "testing"), { recursive: true });
      writeFileSync(
        join(root, "docs", "roadmap", "detail.md"),
        "<!-- loop-engine:completion-evidence kind=checklist path=../testing/evidence.md -->\n",
      );
      writeFileSync(
        join(root, "docs", "testing", "evidence.md"),
        [
          "# Evidence",
          "| Test | Preuve | Verdict |",
          "| --- | --- | --- |",
          "| A01 | snapshot admin | PASS |",
          "- [x] validation visuelle",
        ].join("\n"),
      );

      const result = inspectCompletionEvidenceGate(
        root,
        fixtureCandidate("- [ ] VNEXT4-S6A — [detail](./detail.md)"),
      );

      assert.equal(result.status, "satisfied");
      if (result.status !== "satisfied") return;
      assert.equal(result.unresolvedCount, 0);
      assert.equal(result.evidencePath, "docs/testing/evidence.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the evidence contract escapes the project root", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-evidence-escape-"));
    try {
      mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
      writeFileSync(
        join(root, "docs", "roadmap", "detail.md"),
        "<!-- loop-engine:completion-evidence kind=checklist path=../../../outside.md -->\n",
      );

      const result = inspectCompletionEvidenceGate(
        root,
        fixtureCandidate("- [ ] VNEXT4-S6A — [detail](./detail.md)"),
      );

      assert.equal(result.status, "required");
      if (result.status !== "required") return;
      assert.equal(result.reason, "evidence_outside_project");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

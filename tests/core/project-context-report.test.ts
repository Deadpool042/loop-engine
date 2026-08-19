import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { generateProjectContextReport } from "../../src/core/reports.js";

describe("project context report", () => {
  it("projects canonical planning, roadmap stats, and Git status additively", () => {
    const path = mkdtempSync(join(tmpdir(), "loop-context-report-"));
    try {
      writeFileSync(path + "/roadmap.md", "- [x] Qualified milestone\n");
      const report = generateProjectContextReport({
        name: "fixture",
        path,
        type: "fixture",
        required_docs: [],
        validation: [],
        requires_git: false,
        roadmap: ["roadmap.md"],
        planning: { mode: "roadmap" },
      });

      assert.deepEqual(report.planning, {
        mode: "roadmap",
        roadmapConfigured: true,
        configuredPaths: ["roadmap.md"],
        discoveredPaths: [],
        voluntaryNoWork: false,
        recommendation: "no_admissible_candidate",
      });
      assert.equal(report.roadmap.stats.todo, 0);
      assert.equal(typeof report.git.statusText, "string");
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  });
});

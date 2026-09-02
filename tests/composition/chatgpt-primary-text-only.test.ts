import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLoopApplicationAssembly } from "../../src/composition/application-assembly.js";
import type { ProjectConfig } from "../../src/core/config.js";

function fixture(): { project: ProjectConfig; cleanup: () => void } {
  const path = join(
    tmpdir(),
    `loop-chatgpt-primary-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "objective.md"), "Objective.\n");
  writeFileSync(join(path, "roadmap.md"), "- [x] Done lot\n");
  return {
    project: {
      name: "example",
      path,
      type: "fixture",
      required_docs: [],
      validation: [],
      requires_git: false,
      planning: { mode: "roadmap", objective_source: "objective.md" },
      roadmap: ["roadmap.md"],
    },
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

test("default application assembly never selects an internal text-only provider", async () => {
  const { project, cleanup } = fixture();
  try {
    const report = await createLoopApplicationAssembly().generateRoadmapProposalReport(
      project,
      { timeoutMs: 60_000 },
    );

    assert.equal(report.result.status, "failed");
    if (report.result.status === "failed") {
      assert.equal(report.result.reason, "provider_error");
      assert.equal(report.result.providerFailure?.code, "provider_unavailable");
      assert.equal(report.result.providerFailure?.durationMs, 0);
    }
  } finally {
    cleanup();
  }
});

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import {
  buildObjectiveStatus,
  MAX_OBJECTIVE_SOURCE_BYTES,
} from "../../src/intelligence/objective.js";
import { buildProjectSnapshot } from "../../src/intelligence/project-snapshot.js";

function setupProject(
  files: Readonly<Record<string, string>> = {},
): { path: string; cleanup: () => void } {
  const path = join(
    tmpdir(),
    `loop-objective-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

function project(
  path: string,
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  return {
    name: "example",
    path,
    type: "test",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap" },
    ...overrides,
  };
}

test("loads one valid canonical objective source below the declared root", () => {
  const fixture = setupProject({ "docs/objective.md": "# Objective\nStable." });
  try {
    const status = buildObjectiveStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "docs/objective.md" },
      }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.deepEqual(status, {
      source: "docs/objective.md",
      available: true,
      eligibleForRoadmapProposal: true,
      content: "# Objective\nStable.",
    });
  } finally {
    fixture.cleanup();
  }
});

test("does not make legacy roadmap projects eligible without a configured source", () => {
  const fixture = setupProject();
  try {
    const status = buildObjectiveStatus({
      project: project(fixture.path, { roadmap: ["roadmap.md"] }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.deepEqual(status, {
      source: null,
      available: false,
      eligibleForRoadmapProposal: false,
      reason: "objective_source_not_configured",
    });
  } finally {
    fixture.cleanup();
  }
});

test("refuses a missing configured objective source", () => {
  const fixture = setupProject();
  try {
    const status = buildObjectiveStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "missing.md" },
      }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.equal(status.reason, "objective_source_missing");
    assert.equal(status.eligibleForRoadmapProposal, false);
  } finally {
    fixture.cleanup();
  }
});

test("refuses an objective source outside the project root", () => {
  const fixture = setupProject();
  try {
    const status = buildObjectiveStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "../outside.md" },
      }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.equal(status.reason, "objective_source_outside_project_root");
  } finally {
    fixture.cleanup();
  }
});

test("refuses a directory as an objective source", () => {
  const fixture = setupProject();
  try {
    mkdirSync(join(fixture.path, "docs"));
    const status = buildObjectiveStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "docs" },
      }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.equal(status.reason, "objective_source_not_file");
  } finally {
    fixture.cleanup();
  }
});

test("refuses an objective source exceeding the explicit byte limit", () => {
  const fixture = setupProject({
    "objective.md": "x".repeat(MAX_OBJECTIVE_SOURCE_BYTES + 1),
  });
  try {
    const status = buildObjectiveStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "objective.md" },
      }),
      projectPath: fixture.path,
      mode: "roadmap",
    });

    assert.equal(status.reason, "objective_source_too_large");
    assert.equal(status.available, false);
  } finally {
    fixture.cleanup();
  }
});

for (const [mode, reason] of [
  ["maintenance", "planning_mode_maintenance"],
  ["deferred", "planning_mode_deferred"],
  ["external", "planning_mode_external"],
] as const) {
  test(`${mode} is ineligible for a future roadmap proposal without reading a source`, () => {
    const fixture = setupProject({ "objective.md": "Should not be loaded." });
    try {
      const status = buildObjectiveStatus({
        project: project(fixture.path, {
          planning: { mode, objective_source: "objective.md" },
        }),
        projectPath: fixture.path,
        mode,
      });

      assert.deepEqual(status, {
        source: "objective.md",
        available: false,
        eligibleForRoadmapProposal: false,
        reason,
      });
    } finally {
      fixture.cleanup();
    }
  });
}

test("projects objective eligibility into the canonical snapshot", () => {
  const fixture = setupProject({ "objective.md": "Canonical purpose." });
  try {
    const snapshot = buildProjectSnapshot(
      project(fixture.path, {
        planning: { mode: "roadmap", objective_source: "objective.md" },
      }),
    );

    assert.equal(snapshot.objective.available, true);
    assert.equal(snapshot.objective.eligibleForRoadmapProposal, true);
    assert.equal(snapshot.objective.content, "Canonical purpose.");
  } finally {
    fixture.cleanup();
  }
});

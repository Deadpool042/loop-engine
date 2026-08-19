import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type ProjectConfig } from "../../src/core/config.js";
import { generateRoadmapPlanningStatusReport } from "../../src/core/reports.js";
import {
  buildPlanningStatus,
  discoverConventionalRoadmaps,
  resolvePlanningMode,
} from "../../src/intelligence/planning.js";
import { buildProjectSnapshot } from "../../src/intelligence/project-snapshot.js";

function setupProject(
  files: Readonly<Record<string, string>> = {},
): { path: string; cleanup: () => void } {
  const path = join(
    tmpdir(),
    `loop-planning-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
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
    ...overrides,
  };
}

test("reports a configured roadmap", () => {
  const fixture = setupProject({ "roadmap.md": "- [ ] existing work" });
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path, { roadmap: ["roadmap.md"] }),
      projectPath: fixture.path,
      selectedCandidate: { id: "H1-L1" },
    });

    assert.equal(status.mode, "roadmap");
    assert.equal(status.roadmapConfigured, true);
    assert.deepEqual(status.configuredPaths, ["roadmap.md"]);
    assert.deepEqual(status.discoveredPaths, []);
    assert.equal(status.recommendation, "roadmap_configured");
  } finally {
    fixture.cleanup();
  }
});

test("discovers an additional conventional roadmap beside a configured one", () => {
  const fixture = setupProject({
    "roadmap.md": "- [ ] configured work",
    "roadmap/workflow-roadmap.md": "# unconfigured roadmap",
  });
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path, { roadmap: ["roadmap.md"] }),
      projectPath: fixture.path,
      selectedCandidate: { id: "H1-L1" },
    });

    assert.equal(status.roadmapConfigured, true);
    assert.deepEqual(status.configuredPaths, ["roadmap.md"]);
    assert.deepEqual(status.discoveredPaths, ["roadmap/workflow-roadmap.md"]);
    assert.equal(status.recommendation, "connect_discovered_roadmap");
  } finally {
    fixture.cleanup();
  }
});

test("uses roadmap mode for legacy configuration", () => {
  const fixture = setupProject({ "roadmap.md": "- [ ] legacy work" });
  try {
    const legacy = project(fixture.path, { roadmap: ["roadmap.md"] });

    assert.equal(resolvePlanningMode(legacy), "roadmap");
    assert.equal(
      buildPlanningStatus({
        project: legacy,
        projectPath: fixture.path,
        selectedCandidate: { id: "H1-L1" },
      }).recommendation,
      "roadmap_configured",
    );
  } finally {
    fixture.cleanup();
  }
});

test("detects an unconfigured Development Workspace roadmap fixture", () => {
  const fixtureSource = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "fixtures",
    "planning",
    "development-workspace",
    "roadmap",
    "workflow-roadmap.md",
  );
  const fixture = setupProject({
    "roadmap/workflow-roadmap.md": readFileSync(fixtureSource, "utf8"),
  });
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path, {
        planning: { mode: "roadmap" },
      }),
      projectPath: fixture.path,
      selectedCandidate: null,
    });

    assert.equal(status.roadmapConfigured, false);
    assert.deepEqual(status.discoveredPaths, ["roadmap/workflow-roadmap.md"]);
    assert.equal(status.recommendation, "connect_discovered_roadmap");
  } finally {
    fixture.cleanup();
  }
});

test("detects every conventional unconfigured roadmap in declaration order", () => {
  const fixture = setupProject({
    "roadmap.md": "# one",
    "roadmap/README.md": "# two",
    "roadmap/workflow-roadmap.md": "# three",
    "docs/roadmap/README.md": "# four",
  });
  try {
    assert.deepEqual(
      discoverConventionalRoadmaps(fixture.path, []),
      [
        "roadmap.md",
        "roadmap/README.md",
        "roadmap/workflow-roadmap.md",
        "docs/roadmap/README.md",
      ],
    );
  } finally {
    fixture.cleanup();
  }
});

test("reports a genuinely absent roadmap without inferring a planning intent", () => {
  const fixture = setupProject();
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path),
      projectPath: fixture.path,
      selectedCandidate: null,
    });

    assert.equal(status.mode, null);
    assert.equal(status.roadmapConfigured, false);
    assert.deepEqual(status.discoveredPaths, []);
    assert.equal(status.voluntaryNoWork, false);
    assert.equal(status.recommendation, "no_roadmap_present");
  } finally {
    fixture.cleanup();
  }
});

for (const [mode, recommendation] of [
  ["maintenance", "maintenance_no_work"],
  ["deferred", "deferred_no_work"],
] as const) {
  test(`reports ${mode} as a voluntary no-work state`, () => {
    const fixture = setupProject();
    try {
      const status = buildPlanningStatus({
        project: project(fixture.path, { planning: { mode } }),
        projectPath: fixture.path,
        selectedCandidate: null,
      });

      assert.equal(status.mode, mode);
      assert.equal(status.voluntaryNoWork, true);
      assert.equal(status.recommendation, recommendation);
    } finally {
      fixture.cleanup();
    }
  });
}

test("reports external planning without declaring an absence of work", () => {
  const fixture = setupProject();
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path, { planning: { mode: "external" } }),
      projectPath: fixture.path,
      selectedCandidate: null,
    });

    assert.equal(status.mode, "external");
    assert.equal(status.voluntaryNoWork, false);
    assert.equal(status.recommendation, "external_planning_source");
  } finally {
    fixture.cleanup();
  }
});

test("deferred projects retain configured roadmap information", () => {
  const fixture = setupProject({ "roadmap.md": "| H1-L1 | Deferred | ⬜ À faire |" });
  try {
    const status = buildPlanningStatus({
      project: project(fixture.path, {
        planning: { mode: "deferred" },
        roadmap: ["roadmap.md"],
      }),
      projectPath: fixture.path,
      selectedCandidate: null,
    });

    assert.equal(status.roadmapConfigured, true);
    assert.equal(status.recommendation, "deferred_no_work");
  } finally {
    fixture.cleanup();
  }
});

test("distinguishes a configured roadmap without an admissible candidate", () => {
  const fixture = setupProject({ "roadmap.md": "- [x] already done" });
  try {
    const snapshot = buildProjectSnapshot(
      project(fixture.path, { roadmap: ["roadmap.md"] }),
    );

    assert.equal(snapshot.roadmap.selectedCandidate, null);
    assert.equal(snapshot.planning.recommendation, "no_admissible_candidate");
  } finally {
    fixture.cleanup();
  }
});

test("keeps closed phase-gate candidate admissibility unchanged", () => {
  const fixture = setupProject({
    "roadmap.md": [
      "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
      "| H1-L1 | Deferred work | ⬜ À faire |",
    ].join("\n"),
  });
  try {
    const snapshot = buildProjectSnapshot(
      project(fixture.path, { roadmap: ["roadmap.md"] }),
    );

    assert.equal(snapshot.roadmap.selectedCandidate, null);
    assert.deepEqual(snapshot.roadmap.candidates[0]?.admissibility, {
      state: "not_admissible",
      reason: "phase_closed",
      blockedBy: "H0-RC",
    });
    assert.equal(snapshot.planning.recommendation, "no_admissible_candidate");
  } finally {
    fixture.cleanup();
  }
});

test("returns the V24 JSON contract without filesystem mutation", () => {
  const fixture = setupProject({
    "roadmap/workflow-roadmap.md": "# discovered",
  });
  try {
    const before = readdirSync(fixture.path).sort();
    const report = generateRoadmapPlanningStatusReport(
      project(fixture.path, { planning: { mode: "roadmap" } }),
    );
    const after = readdirSync(fixture.path).sort();

    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(report.project, { name: "example" });
    assert.equal(report.planning.recommendation, "connect_discovered_roadmap");
    assert.deepEqual(after, before);
    assert.equal(existsSync(join(fixture.path, ".loop-engine")), false);
  } finally {
    fixture.cleanup();
  }
});

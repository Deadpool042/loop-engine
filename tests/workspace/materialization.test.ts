import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  resolveProjectsRoot,
  type Config,
  type ProjectConfig,
} from "../../src/core/config.js";
import { buildProjectSnapshot } from "../../src/intelligence/project-snapshot.js";
import { materializeWorkspaceProject } from "../../src/workspace/materialization.js";

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "fixture",
    path: join(
      resolveProjectsRoot(tmpdir()).canonicalPath,
      "loop-engine-workspace-fixture-does-not-exist",
    ),
    type: "fixture",
    required_docs: ["README.md"],
    validation: [],
    planning: { mode: "maintenance" },
    ...overrides,
  };
}

test("none mode treats an absent project as expected and healthy", () => {
  const fixture = project({
    workspace: { mode: "none", dependencies: "none" },
  });
  const snapshot = buildProjectSnapshot(fixture, resolveProjectsRoot(tmpdir()));

  assert.equal(snapshot.workspace.materialized, false);
  assert.equal(snapshot.workspace.expectedAbsent, true);
  assert.deepEqual(snapshot.docs.missing, []);
  assert.equal(snapshot.git.clean, true);
  assert.equal(snapshot.health, "good");
});

test("on_demand mode treats an absent project as expected and healthy", () => {
  const fixture = project({
    repository: "Deadpool042/example",
    workspace: { mode: "on_demand", dependencies: "on_demand" },
  });
  const snapshot = buildProjectSnapshot(fixture, resolveProjectsRoot(tmpdir()));

  assert.equal(snapshot.workspace.expectedAbsent, true);
  assert.equal(snapshot.workspace.repository, "Deadpool042/example");
  assert.equal(snapshot.health, "good");
});

test("source_only mode still warns when its source checkout is absent", () => {
  const fixture = project({
    repository: "Deadpool042/example",
    workspace: { mode: "source_only", dependencies: "none" },
  });
  const snapshot = buildProjectSnapshot(fixture, resolveProjectsRoot(tmpdir()));

  assert.equal(snapshot.workspace.expectedAbsent, false);
  assert.deepEqual(snapshot.docs.missing, ["README.md"]);
  assert.equal(snapshot.health, "warning");
});

test("materialization skips mode none without requiring a repository", () => {
  const fixture = project({
    workspace: { mode: "none", dependencies: "none" },
  });
  const config: Config = { projects: [fixture] };

  assert.deepEqual(materializeWorkspaceProject(config, fixture), {
    schemaVersion: 1,
    project: "fixture",
    mode: "none",
    dependencies: "none",
    path: join(
      resolveProjectsRoot(tmpdir()).canonicalPath,
      "loop-engine-workspace-fixture-does-not-exist",
    ),
    repository: null,
    status: "skipped",
    reason: "mode_none",
  });
});

test("materialization rejects repository values outside the bounded GitHub slug contract", () => {
  const fixture = project({
    path: "../fixture",
    repository: "https://example.com/arbitrary/repo.git",
    workspace: { mode: "on_demand", dependencies: "on_demand" },
  });
  const config: Config = {
    workspace_policy: { min_free_disk_gib: 20 },
    projects: [fixture],
  };

  const result = materializeWorkspaceProject(config, fixture);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "invalid_repository");
});

test("materialization accepts a confined nested destination and checks free space at Projects root", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-materialization-root-"));
  const destination = join(root, "apps", "internal", "fixture");
  mkdirSync(join(root, "apps", "internal"), { recursive: true });
  const previous = process.env.LOOP_PROJECTS_ROOT;
  process.env.LOOP_PROJECTS_ROOT = root;
  try {
    const fixture = project({
      path: destination,
      repository: "Deadpool042/fixture",
      workspace: { mode: "permanent", dependencies: "none" },
    });
    const result = materializeWorkspaceProject(
      {
        workspace_policy: { min_free_disk_gib: 100_000 },
        projects: [fixture],
      },
      fixture,
    );

    assert.equal(result.reason, "low_disk_space");
    assert.equal(
      result.path,
      join(realpathSync(root), "apps", "internal", "fixture"),
    );
  } finally {
    if (previous === undefined) delete process.env.LOOP_PROJECTS_ROOT;
    else process.env.LOOP_PROJECTS_ROOT = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

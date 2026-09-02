import assert from "node:assert/strict";
import { test } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import { buildProjectSnapshot } from "../../src/intelligence/project-snapshot.js";
import { materializeWorkspaceProject } from "../../src/workspace/materialization.js";

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "fixture",
    path: "/tmp/loop-engine-workspace-fixture-does-not-exist",
    type: "fixture",
    required_docs: ["README.md"],
    validation: [],
    planning: { mode: "maintenance" },
    ...overrides,
  };
}

test("none mode treats an absent project as expected and healthy", () => {
  const fixture = project({ workspace: { mode: "none", dependencies: "none" } });
  const snapshot = buildProjectSnapshot(fixture);

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
  const snapshot = buildProjectSnapshot(fixture);

  assert.equal(snapshot.workspace.expectedAbsent, true);
  assert.equal(snapshot.workspace.repository, "Deadpool042/example");
  assert.equal(snapshot.health, "good");
});

test("source_only mode still warns when its source checkout is absent", () => {
  const fixture = project({
    repository: "Deadpool042/example",
    workspace: { mode: "source_only", dependencies: "none" },
  });
  const snapshot = buildProjectSnapshot(fixture);

  assert.equal(snapshot.workspace.expectedAbsent, false);
  assert.deepEqual(snapshot.docs.missing, ["README.md"]);
  assert.equal(snapshot.health, "warning");
});

test("materialization skips mode none without requiring a repository", () => {
  const fixture = project({ workspace: { mode: "none", dependencies: "none" } });
  const config: Config = { projects: [fixture] };

  assert.deepEqual(materializeWorkspaceProject(config, fixture), {
    schemaVersion: 1,
    project: "fixture",
    mode: "none",
    dependencies: "none",
    path: "/tmp/loop-engine-workspace-fixture-does-not-exist",
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

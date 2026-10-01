import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { archiveProject } from "../../src/workspace/project-archive.js";
import { findProject } from "../../src/core/project.js";
import { generateWorkspaceReports } from "../../src/core/reports.js";
import type { Config } from "../../src/core/config.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commitAll(cwd: string, message: string): void {
  git(cwd, ["add", "--all"]);
  git(cwd, [
    "-c",
    "user.name=Loop Engine Test",
    "-c",
    "user.email=loop-engine-test@localhost",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    message,
  ]);
}

async function fixture(branch = "feat/archive") {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-archive-"));
  const workspace = path.join(root, "pilot-project");
  const loopEngineRoot = path.join(root, "loop-engine");
  await mkdir(workspace);
  await writeFile(path.join(workspace, "README.md"), "# pilot\n", "utf8");
  await mkdir(loopEngineRoot);
  await writeFile(
    path.join(loopEngineRoot, "projects.yaml"),
    [
      "projects:",
      "  - name: pilot-project",
      "    path: ../pilot-project",
      "    type: static-site",
      "    required_docs: []",
      "    validation: []",
      "",
    ].join("\n"),
    "utf8",
  );
  git(loopEngineRoot, ["-c", "init.templateDir=", "init", "-b", "main"]);
  commitAll(loopEngineRoot, "initial registry");
  if (branch !== "main") git(loopEngineRoot, ["checkout", "-b", branch]);
  return { root, workspace, loopEngineRoot };
}

test("archives one project canonically without deleting its local workspace", async () => {
  const { root, workspace, loopEngineRoot } = await fixture();
  try {
    const result = archiveProject(loopEngineRoot, "pilot-project", true);
    assert.deepEqual(result, {
      schemaVersion: 1,
      status: "archived",
      project: { name: "pilot-project", type: "static-site" },
      registry: "projects.yaml",
      workspaceDeleted: false,
    });

    const config = parseYaml(
      await readFile(path.join(loopEngineRoot, "projects.yaml"), "utf8"),
    ) as Config;
    assert.equal(config.projects[0]?.archived, true);
    assert.equal(findProject(config, "pilot-project"), null);
    assert.deepEqual(generateWorkspaceReports(config), []);
    assert.equal((await stat(workspace)).isDirectory(), true);
    assert.equal(
      await readFile(path.join(workspace, "README.md"), "utf8"),
      "# pilot\n",
    );
    assert.equal(git(loopEngineRoot, ["status", "--porcelain"]), "M projects.yaml");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses project archive on Loop Engine main", async () => {
  const { root, loopEngineRoot } = await fixture("main");
  try {
    assert.throws(
      () => archiveProject(loopEngineRoot, "pilot-project", true),
      /dedicated non-main/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses an unknown or already archived project", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    assert.throws(
      () => archiveProject(loopEngineRoot, "missing-project", true),
      /not registered/,
    );
    archiveProject(loopEngineRoot, "pilot-project", true);
    commitAll(loopEngineRoot, "archive pilot");
    assert.throws(
      () => archiveProject(loopEngineRoot, "pilot-project", true),
      /already archived/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

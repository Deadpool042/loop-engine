import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { setProjectRepository } from "../../src/workspace/project-set-repository.js";
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

const REGISTRY = [
  "workspace_policy:",
  "  min_free_disk_gib: 20",
  "",
  "projects:",
  "  - name: other-project",
  "    path: ../other-project",
  "    repository: acme/other-project",
  "    type: static-site",
  "    required_docs: []",
  "    validation: []",
  "",
  "  - name: pilot-project",
  "    path: ../pilot-project",
  "    type: static-site",
  "    workspace:",
  "      mode: source_only",
  "    required_docs:",
  "      - README.md",
  "    validation: []",
  "    roadmap:",
  "      - docs/roadmap/README.md",
  "  - name: archived-project",
  "    path: ../archived-project",
  "    type: static-site",
  "    required_docs: []",
  "    validation: []",
  "    archived: true",
  "",
].join("\n");

async function fixture(branch = "feat/set-repository") {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-set-repository-"));
  const loopEngineRoot = path.join(root, "loop-engine");
  await mkdir(loopEngineRoot);
  await writeFile(path.join(loopEngineRoot, "projects.yaml"), REGISTRY, "utf8");
  git(loopEngineRoot, ["-c", "init.templateDir=", "init", "-b", "main"]);
  commitAll(loopEngineRoot, "initial registry");
  if (branch !== "main") git(loopEngineRoot, ["checkout", "-b", branch]);
  return { root, loopEngineRoot };
}

test("adds exactly one repository line to an existing active project", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    const result = setProjectRepository(loopEngineRoot, "pilot-project", "acme/pilot-project", true);
    assert.deepEqual(result, {
      schemaVersion: 1,
      status: "repository_set",
      project: { name: "pilot-project", type: "static-site", repository: "acme/pilot-project" },
      registry: "projects.yaml",
    });

    const patch = git(loopEngineRoot, ["diff", "--no-color", "--unified=0", "--", "projects.yaml"]);
    const changed = patch.split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
    assert.deepEqual(changed, ["+    repository: acme/pilot-project"]);

    const config = parseYaml(await readFile(path.join(loopEngineRoot, "projects.yaml"), "utf8")) as Config;
    const byName = new Map(config.projects.map((entry) => [entry.name, entry]));
    assert.equal(byName.get("pilot-project")?.repository, "acme/pilot-project");
    assert.equal(byName.get("pilot-project")?.type, "static-site");
    assert.equal(byName.get("other-project")?.repository, "acme/other-project");
    assert.equal(byName.get("archived-project")?.archived, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses to run on Loop Engine main or on a dirty worktree", async () => {
  const onMain = await fixture("main");
  try {
    assert.throws(
      () => setProjectRepository(onMain.loopEngineRoot, "pilot-project", "acme/pilot-project", true),
      /dedicated non-main/,
    );
  } finally {
    await rm(onMain.root, { recursive: true, force: true });
  }

  const dirty = await fixture();
  try {
    await writeFile(path.join(dirty.loopEngineRoot, "stray.txt"), "x\n", "utf8");
    assert.throws(
      () => setProjectRepository(dirty.loopEngineRoot, "pilot-project", "acme/pilot-project", true),
      /clean Loop Engine worktree/,
    );
  } finally {
    await rm(dirty.root, { recursive: true, force: true });
  }
});

test("refuses unknown, archived, already-set, invalid and unconfirmed requests without writing", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    assert.throws(() => setProjectRepository(loopEngineRoot, "missing", "acme/x", true), /not registered/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "archived-project", "acme/x", true), /archived/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "other-project", "acme/other-project", true), /already set/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "other-project", "acme/different", true), /already set/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "pilot-project", "https://github.com/acme/x", true), /Invalid GitHub repository/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "pilot-project", "acme/x/y", true), /Invalid GitHub repository/);
    assert.throws(() => setProjectRepository(loopEngineRoot, "Pilot_Project", "acme/x", true), /Invalid project identity/);
    assert.throws(
      () => setProjectRepository(loopEngineRoot, "pilot-project", "acme/pilot-project", false as unknown as true),
      /explicitly confirmed/,
    );
    assert.equal(git(loopEngineRoot, ["status", "--porcelain"]), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

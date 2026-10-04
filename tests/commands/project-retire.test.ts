import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { archiveProject } from "../../src/workspace/project-archive.js";
import { registerProjectEnvelope } from "../../src/workspace/project-registration.js";
import { retireProject } from "../../src/workspace/project-retire.js";
import { findProject } from "../../src/core/project.js";
import { generateDoctorReport, generateWorkspaceReports } from "../../src/core/reports.js";
import type { Config } from "../../src/core/config.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commitAll(cwd: string, message: string): void {
  git(cwd, ["add", "--all"]);
  git(cwd, ["-c", "user.name=Loop Engine Test", "-c", "user.email=loop-engine-test@localhost", "-c", "commit.gpgsign=false", "commit", "-m", message]);
}

const REGISTRY = [
  "projects:",
  "  - name: pilot-project",
  "    path: ../pilot-project",
  "    type: static-site",
  "    required_docs: []",
  "    validation: []",
  "  - name: neighbour",
  "    path: ../neighbour",
  "    type: static-site",
  "    required_docs: []",
  "    validation: []",
  "",
].join("\n");

async function fixture(options: { archived?: boolean; branch?: string } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-retire-"));
  const loopEngineRoot = path.join(root, "loop-engine");
  await mkdir(loopEngineRoot);
  await mkdir(path.join(root, "neighbour"));
  await writeFile(path.join(loopEngineRoot, "projects.yaml"), REGISTRY, "utf8");
  git(loopEngineRoot, ["-c", "init.templateDir=", "init", "-b", "main"]);
  commitAll(loopEngineRoot, "initial registry");
  git(loopEngineRoot, ["checkout", "-b", options.branch ?? "feat/retire"]);
  if (options.archived !== false) {
    archiveProject(loopEngineRoot, "pilot-project", true);
    commitAll(loopEngineRoot, "archive pilot");
  }
  return { root, loopEngineRoot };
}

const read = async (loopEngineRoot: string) =>
  parseYaml(await readFile(path.join(loopEngineRoot, "projects.yaml"), "utf8")) as Config;

test("retires an archived project with exactly one added flag, keeping the entry", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    assert.deepEqual(retireProject(loopEngineRoot, "pilot-project", true), {
      schemaVersion: 1,
      status: "retired",
      project: { name: "pilot-project", type: "static-site" },
      registry: "projects.yaml",
      identityKept: true,
    });
    const diff = git(loopEngineRoot, ["diff", "-U0", "--", "projects.yaml"]).split("\n");
    const added = diff.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    const removed = diff.filter((line) => line.startsWith("-") && !line.startsWith("---"));
    assert.deepEqual(added, ["+    retired: true"]);
    assert.deepEqual(removed, []);

    const config = await read(loopEngineRoot);
    assert.equal(config.projects.length, 2);
    assert.equal(config.projects[0]?.archived, true);
    assert.equal(config.projects[0]?.retired, true);
    assert.equal(config.projects[1]?.retired, undefined);
    assert.equal(config.projects[1]?.archived, undefined);
    assert.equal(findProject(config, "pilot-project"), null);
    assert.notEqual(findProject(config, "neighbour"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a project that is not archived, unknown, or already retired", async () => {
  const notArchived = await fixture({ archived: false });
  try {
    assert.throws(() => retireProject(notArchived.loopEngineRoot, "pilot-project", true), /must be archived/);
    assert.throws(() => retireProject(notArchived.loopEngineRoot, "missing-project", true), /not registered/);
    assert.equal((await read(notArchived.loopEngineRoot)).projects[0]?.retired, undefined);
  } finally {
    await rm(notArchived.root, { recursive: true, force: true });
  }
  const { root, loopEngineRoot } = await fixture();
  try {
    retireProject(loopEngineRoot, "pilot-project", true);
    commitAll(loopEngineRoot, "retire pilot");
    assert.throws(() => retireProject(loopEngineRoot, "pilot-project", true), /already retired/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses main, a dirty worktree, an invalid name and a missing confirmation", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    assert.throws(() => retireProject(loopEngineRoot, "Bad_Name", true), /Invalid project identity/);
    assert.throws(() => retireProject(loopEngineRoot, "pilot-project", false as unknown as true), /explicitly confirmed/);
    await writeFile(path.join(loopEngineRoot, "stray.txt"), "x", "utf8");
    assert.throws(() => retireProject(loopEngineRoot, "pilot-project", true), /clean Loop Engine worktree/);
    await rm(path.join(loopEngineRoot, "stray.txt"));
    git(loopEngineRoot, ["checkout", "main"]);
    assert.throws(() => retireProject(loopEngineRoot, "pilot-project", true), /dedicated non-main/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a retired identity with no workspace never breaks doctor and is never reported", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    retireProject(loopEngineRoot, "pilot-project", true);
    const config = await read(loopEngineRoot);
    const doctor = generateDoctorReport(config);
    assert.deepEqual(doctor.projects.map((entry) => entry.project.name), ["neighbour"]);
    // a registry holding only the retired entry (no workspace on disk) is healthy
    const onlyRetired = { projects: config.projects.filter((entry) => entry.retired === true) };
    assert.equal(onlyRetired.projects.length, 1);
    assert.deepEqual(generateDoctorReport(onlyRetired), { projects: [], hasError: false });
    assert.deepEqual(generateWorkspaceReports(config).map((r) => r.project.name), ["neighbour"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the identity can never be registered again once retired", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    retireProject(loopEngineRoot, "pilot-project", true);
    commitAll(loopEngineRoot, "retire pilot");
    git(loopEngineRoot, ["checkout", "-b", "feat/reuse"]);
    // a recreated, approved envelope with the retired name must still be refused
    const target = path.join(root, "pilot-project");
    await mkdir(target);
    await writeFile(path.join(target, "PROJECT-BRIEF.md"), "# Project Brief\n\n- Projet : `pilot-project`\n- Type : `static-site`\n- Statut : approved\n", "utf8");
    git(target, ["-c", "init.templateDir=", "init", "-b", "main"]);
    commitAll(target, "bootstrap envelope");
    assert.throws(
      () => registerProjectEnvelope(loopEngineRoot, "pilot-project", "static-site", true),
      /retired and can never be registered again/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a retired entry is hidden from every active resolution even without the archived flag", () => {
  const config: Config = {
    projects: [
      { name: "ghost", path: "../ghost", type: "static-site", required_docs: [], validation: [], retired: true },
    ],
  };
  assert.equal(findProject(config, "ghost"), null);
  assert.deepEqual(generateWorkspaceReports(config), []);
});

test("refuses an identity registered twice instead of guessing which entry to retire", async () => {
  const { root, loopEngineRoot } = await fixture();
  try {
    const file = path.join(loopEngineRoot, "projects.yaml");
    const text = await readFile(file, "utf8");
    await writeFile(file, text + "  - name: pilot-project\n    path: ../pilot-project-copy\n    type: static-site\n    required_docs: []\n    validation: []\n    archived: true\n", "utf8");
    commitAll(loopEngineRoot, "duplicate identity");
    assert.throws(() => retireProject(loopEngineRoot, "pilot-project", true), /more than once/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

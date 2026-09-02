import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { registerProjectEnvelope } from "../../src/workspace/project-registration.js";
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

async function createLoopEngineFixture(root: string, branch = "feat/register"): Promise<string> {
  const loopEngineRoot = path.join(root, "loop-engine");
  await mkdir(loopEngineRoot);
  await writeFile(
    path.join(loopEngineRoot, "projects.yaml"),
    "workspace_policy:\n  min_free_disk_gib: 20\n\nprojects:\n  - name: existing\n    path: ../existing\n    type: generic\n    required_docs: []\n    validation: []\n",
    "utf8",
  );
  git(loopEngineRoot, ["-c", "init.templateDir=", "init", "-b", "main"]);
  commitAll(loopEngineRoot, "initial registry");
  if (branch !== "main") git(loopEngineRoot, ["checkout", "-b", branch]);
  return loopEngineRoot;
}

async function createApprovedEnvelope(
  root: string,
  name: string,
  type: string,
  status: "approved" | "draft" = "approved",
): Promise<string> {
  const target = path.join(root, name);
  await mkdir(target);
  await writeFile(
    path.join(target, "PROJECT-BRIEF.md"),
    `# Project Brief\n\n- Projet : \`${name}\`\n- Type : \`${type}\`\n- Statut : ${status}\n`,
    "utf8",
  );
  await writeFile(path.join(target, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(path.join(target, "README.md"), `# ${name}\n`, "utf8");
  await mkdir(path.join(target, "docs", "roadmap"), { recursive: true });
  await writeFile(path.join(target, "docs", "roadmap", "README.md"), "# Roadmap\n", "utf8");
  git(target, ["-c", "init.templateDir=", "init", "-b", "main"]);
  commitAll(target, "bootstrap envelope");
  return target;
}

test("registers one approved clean envelope on a dedicated Loop Engine branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-register-"));
  try {
    const loopEngineRoot = await createLoopEngineFixture(root);
    const target = await createApprovedEnvelope(root, "pilot-project", "web-app");

    const result = registerProjectEnvelope(
      loopEngineRoot,
      "pilot-project",
      "web-app",
      true,
    );

    assert.deepEqual(result, {
      schemaVersion: 1,
      status: "registered",
      project: { name: "pilot-project", type: "web-app", path: target },
      registry: "projects.yaml",
    });

    const config = parseYaml(
      await readFile(path.join(loopEngineRoot, "projects.yaml"), "utf8"),
    ) as Config;
    const project = config.projects.find((entry) => entry.name === "pilot-project");
    assert.ok(project);
    assert.equal(project.path, "../pilot-project");
    assert.equal(project.type, "web-app");
    assert.deepEqual(project.workspace, { mode: "source_only", dependencies: "on_demand" });
    assert.deepEqual(project.planning, {
      mode: "roadmap",
      objective_source: "PROJECT-BRIEF.md",
    });
    assert.deepEqual(project.roadmap, ["docs/roadmap/README.md"]);
    assert.equal(git(loopEngineRoot, ["status", "--porcelain"]), "M projects.yaml");
    assert.equal(git(target, ["status", "--porcelain"]), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses registration on Loop Engine main", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-register-main-"));
  try {
    const loopEngineRoot = await createLoopEngineFixture(root, "main");
    await createApprovedEnvelope(root, "pilot-project", "generic");
    assert.throws(
      () => registerProjectEnvelope(loopEngineRoot, "pilot-project", "generic", true),
      /dedicated non-main/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a draft brief or a type mismatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-register-brief-"));
  try {
    const loopEngineRoot = await createLoopEngineFixture(root);
    await createApprovedEnvelope(root, "draft-project", "generic", "draft");
    assert.throws(
      () => registerProjectEnvelope(loopEngineRoot, "draft-project", "generic", true),
      /not explicitly approved/,
    );

    await createApprovedEnvelope(root, "typed-project", "web-app", "approved");
    assert.throws(
      () => registerProjectEnvelope(loopEngineRoot, "typed-project", "infra", true),
      /type does not match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses duplicate project identities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loop-project-register-duplicate-"));
  try {
    const loopEngineRoot = await createLoopEngineFixture(root);
    await createApprovedEnvelope(root, "existing", "generic");
    assert.throws(
      () => registerProjectEnvelope(loopEngineRoot, "existing", "generic", true),
      /already registered/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

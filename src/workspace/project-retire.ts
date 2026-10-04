import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isMap, isSeq, parse as parseYaml, parseDocument } from "yaml";

import type { Config } from "../core/config.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type ProjectRetireResult = Readonly<{
  schemaVersion: 1;
  status: "retired";
  project: Readonly<{
    name: string;
    type: string;
  }>;
  registry: "projects.yaml";
  identityKept: true;
}>;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024,
  }).trim();
}

function assertRetireWorktree(loopEngineRoot: string): void {
  if (!existsSync(path.join(loopEngineRoot, ".git"))) {
    throw new Error("Loop Engine retire requires a Git repository.");
  }
  const branch = git(loopEngineRoot, ["branch", "--show-current"]);
  if (!branch || branch === "main") {
    throw new Error(
      "Project retire must run on a dedicated non-main Loop Engine branch.",
    );
  }
  if (git(loopEngineRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Project retire requires a clean Loop Engine worktree.");
  }
}

/**
 * Tombstones the canonical identity of an ALREADY ARCHIVED project: one added
 * `retired: true` flag. The registry entry (and its git history) is kept, so the
 * name can never be registered again and the project never reappears as active.
 * Loop Engine does not check that the project's assets are gone: that proof is
 * the caller's (Development Workspace's delete plan), and this runs last.
 */
export function retireProject(
  loopEngineRoot: string,
  name: string,
  confirmRetire: true,
): ProjectRetireResult {
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new Error("Invalid project identity.");
  }
  if (confirmRetire !== true) {
    throw new Error("Project retire must be explicitly confirmed.");
  }

  const canonicalLoopEngineRoot = path.resolve(loopEngineRoot);
  assertRetireWorktree(canonicalLoopEngineRoot);

  const registryPath = path.join(canonicalLoopEngineRoot, "projects.yaml");
  const original = readFileSync(registryPath, "utf8");
  const config = parseYaml(original) as Config;
  const matches = config.projects.filter((entry) => entry.name === name);
  if (matches.length === 0) throw new Error("Project identity is not registered.");
  if (matches.length > 1) throw new Error("Project identity is registered more than once.");
  const project = matches[0]!;
  if (project.retired === true) throw new Error("Project is already retired.");
  if (project.archived !== true) {
    throw new Error("Project must be archived before it can be retired.");
  }

  const document = parseDocument(original);
  if (document.errors.length > 0) throw new Error("projects.yaml is invalid.");
  const projects = document.get("projects", true);
  if (!isSeq(projects)) {
    throw new Error("projects.yaml projects node is not a sequence.");
  }
  const projectNode = projects.items.find(
    (item) => isMap(item) && item.get("name") === name,
  );
  if (!projectNode || !isMap(projectNode)) {
    throw new Error("Project registry entry is not writable.");
  }
  projectNode.set("retired", true);

  try {
    writeFileSync(registryPath, document.toString({ lineWidth: 0 }), "utf8");
    const reparsed = parseYaml(readFileSync(registryPath, "utf8")) as Config;
    const retired = reparsed.projects.find((entry) => entry.name === name);
    if (!retired || retired.retired !== true || retired.archived !== true) {
      throw new Error("Retired project failed post-write verification.");
    }
  } catch (error) {
    writeFileSync(registryPath, original, "utf8");
    throw error;
  }

  return {
    schemaVersion: 1,
    status: "retired",
    project: { name, type: project.type },
    registry: "projects.yaml",
    identityKept: true,
  };
}

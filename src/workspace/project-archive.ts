import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isMap, isSeq, parse as parseYaml, parseDocument } from "yaml";

import type { Config } from "../core/config.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type ProjectArchiveResult = Readonly<{
  schemaVersion: 1;
  status: "archived";
  project: Readonly<{
    name: string;
    type: string;
  }>;
  registry: "projects.yaml";
  workspaceDeleted: false;
}>;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024,
  }).trim();
}

function assertArchiveWorktree(loopEngineRoot: string): void {
  if (!existsSync(path.join(loopEngineRoot, ".git"))) {
    throw new Error("Loop Engine archive requires a Git repository.");
  }
  const branch = git(loopEngineRoot, ["branch", "--show-current"]);
  if (!branch || branch === "main") {
    throw new Error(
      "Project archive must run on a dedicated non-main Loop Engine branch.",
    );
  }
  if (git(loopEngineRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Project archive requires a clean Loop Engine worktree.");
  }
}

export function archiveProject(
  loopEngineRoot: string,
  name: string,
  confirmArchive: true,
): ProjectArchiveResult {
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new Error("Invalid project identity.");
  }
  if (confirmArchive !== true) {
    throw new Error("Project archive must be explicitly confirmed.");
  }

  const canonicalLoopEngineRoot = path.resolve(loopEngineRoot);
  assertArchiveWorktree(canonicalLoopEngineRoot);

  const registryPath = path.join(canonicalLoopEngineRoot, "projects.yaml");
  const original = readFileSync(registryPath, "utf8");
  const config = parseYaml(original) as Config;
  const project = config.projects.find((entry) => entry.name === name);
  if (!project) throw new Error("Project identity is not registered.");
  if (project.archived === true) throw new Error("Project is already archived.");

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
  projectNode.set("archived", true);

  try {
    writeFileSync(registryPath, document.toString({ lineWidth: 0 }), "utf8");
    const reparsed = parseYaml(readFileSync(registryPath, "utf8")) as Config;
    const archived = reparsed.projects.find((entry) => entry.name === name);
    if (!archived || archived.archived !== true) {
      throw new Error("Archived project failed post-write verification.");
    }
  } catch (error) {
    writeFileSync(registryPath, original, "utf8");
    throw error;
  }

  return {
    schemaVersion: 1,
    status: "archived",
    project: { name, type: project.type },
    registry: "projects.yaml",
    workspaceDeleted: false,
  };
}

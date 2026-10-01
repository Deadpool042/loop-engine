import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isMap, isSeq, parse as parseYaml, parseDocument } from "yaml";

import type { Config } from "../core/config.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type ProjectSetRepositoryResult = Readonly<{
  schemaVersion: 1;
  status: "repository_set";
  project: Readonly<{
    name: string;
    type: string;
    repository: string;
  }>;
  registry: "projects.yaml";
}>;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024,
  }).trim();
}

function assertWorktree(loopEngineRoot: string): void {
  if (!existsSync(path.join(loopEngineRoot, ".git"))) {
    throw new Error("Loop Engine set-repository requires a Git repository.");
  }
  const branch = git(loopEngineRoot, ["branch", "--show-current"]);
  if (!branch || branch === "main") {
    throw new Error(
      "Project set-repository must run on a dedicated non-main Loop Engine branch.",
    );
  }
  if (git(loopEngineRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Project set-repository requires a clean Loop Engine worktree.");
  }
}

/**
 * Adds the `repository` key to an existing active registry entry, nothing
 * else. Never overwrites a repository and never touches an archived entry.
 */
export function setProjectRepository(
  loopEngineRoot: string,
  name: string,
  repository: string,
  confirmSetRepository: true,
): ProjectSetRepositoryResult {
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new Error("Invalid project identity.");
  }
  if (!GITHUB_REPOSITORY_PATTERN.test(repository)) {
    throw new Error("Invalid GitHub repository identity.");
  }
  if (confirmSetRepository !== true) {
    throw new Error("Project set-repository must be explicitly confirmed.");
  }

  const canonicalRoot = path.resolve(loopEngineRoot);
  assertWorktree(canonicalRoot);

  const registryPath = path.join(canonicalRoot, "projects.yaml");
  const original = readFileSync(registryPath, "utf8");
  const config = parseYaml(original) as Config;
  const project = config.projects.find((entry) => entry.name === name);
  if (!project) throw new Error("Project identity is not registered.");
  if (project.archived === true) throw new Error("Project is archived.");
  if (project.repository !== undefined) {
    throw new Error("Project repository is already set.");
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
  projectNode.set("repository", repository);

  try {
    writeFileSync(registryPath, document.toString({ lineWidth: 0 }), "utf8");
    const reparsed = parseYaml(readFileSync(registryPath, "utf8")) as Config;
    const updated = reparsed.projects.find((entry) => entry.name === name);
    if (!updated || updated.repository !== repository) {
      throw new Error("Project repository failed post-write verification.");
    }
  } catch (error) {
    writeFileSync(registryPath, original, "utf8");
    throw error;
  }

  return {
    schemaVersion: 1,
    status: "repository_set",
    project: { name, type: project.type, repository },
    registry: "projects.yaml",
  };
}

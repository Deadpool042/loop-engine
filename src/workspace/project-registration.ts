import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isSeq, parse as parseYaml, parseDocument } from "yaml";

import type { Config, ProjectConfig } from "../core/config.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PROJECT_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const APPROVED_LINE = "- Statut : approved";

export type ProjectRegistrationResult = Readonly<{
  schemaVersion: 1;
  status: "registered";
  project: Readonly<{
    name: string;
    type: string;
    path: string;
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

function assertRegistrationInput(
  name: string,
  type: string,
  confirmBriefApproved: true,
): void {
  if (!PROJECT_NAME_PATTERN.test(name)) throw new Error("Invalid project identity.");
  if (!PROJECT_TYPE_PATTERN.test(type)) throw new Error("Invalid project type.");
  if (confirmBriefApproved !== true) {
    throw new Error("Approved Project Brief must be explicitly confirmed.");
  }
}

function assertLoopEngineRegistrationWorktree(loopEngineRoot: string): void {
  if (!existsSync(path.join(loopEngineRoot, ".git"))) {
    throw new Error("Loop Engine registration requires a Git repository.");
  }
  const branch = git(loopEngineRoot, ["branch", "--show-current"]);
  if (!branch || branch === "main") {
    throw new Error(
      "Project registration must run on a dedicated non-main Loop Engine branch.",
    );
  }
  if (git(loopEngineRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Project registration requires a clean Loop Engine worktree.");
  }
}

function assertApprovedEnvelope(
  workspaceRoot: string,
  name: string,
  type: string,
): string {
  const target = path.resolve(workspaceRoot, name);
  if (path.dirname(target) !== workspaceRoot) {
    throw new Error("Project must be a direct workspace child.");
  }
  if (!existsSync(path.join(target, ".git"))) {
    throw new Error("Project envelope is not an initialized Git repository.");
  }
  if (git(target, ["branch", "--show-current"]) !== "main") {
    throw new Error("Project envelope must be on main before registration.");
  }
  if (git(target, ["status", "--porcelain"]) !== "") {
    throw new Error("Project envelope must be clean before registration.");
  }

  const briefPath = path.join(target, "PROJECT-BRIEF.md");
  if (!existsSync(briefPath)) throw new Error("PROJECT-BRIEF.md is missing.");
  const brief = readFileSync(briefPath, "utf8");
  const approvedCount = brief.split(APPROVED_LINE).length - 1;
  if (approvedCount !== 1 || brief.includes("- Statut : draft")) {
    throw new Error("Project Brief is not explicitly approved.");
  }
  if (!brief.includes(`- Type : \`${type}\``)) {
    throw new Error("Project type does not match the approved Project Brief.");
  }
  return target;
}

function projectConfig(name: string, type: string): ProjectConfig {
  return {
    name,
    path: `../${name}`,
    type,
    workspace: { mode: "source_only", dependencies: "on_demand" },
    required_docs: [
      "AGENTS.md",
      "README.md",
      "PROJECT-BRIEF.md",
      "docs/roadmap/README.md",
    ],
    validation: [],
    planning: { mode: "roadmap", objective_source: "PROJECT-BRIEF.md" },
    roadmap: ["docs/roadmap/README.md"],
  };
}

/**
 * Registers one already-approved local project envelope in Loop Engine.
 * The mutation is intentionally limited to projects.yaml and requires a
 * dedicated non-main Loop Engine branch so the normal PR workflow remains mandatory.
 */
export function registerProjectEnvelope(
  loopEngineRoot: string,
  name: string,
  type: string,
  confirmBriefApproved: true,
): ProjectRegistrationResult {
  assertRegistrationInput(name, type, confirmBriefApproved);
  const canonicalLoopEngineRoot = path.resolve(loopEngineRoot);
  assertLoopEngineRegistrationWorktree(canonicalLoopEngineRoot);

  const workspaceRoot = path.dirname(canonicalLoopEngineRoot);
  const target = assertApprovedEnvelope(workspaceRoot, name, type);
  const registryPath = path.join(canonicalLoopEngineRoot, "projects.yaml");
  const original = readFileSync(registryPath, "utf8");
  const config = parseYaml(original) as Config;
  const relativePath = `../${name}`;
  if (config.projects.some((project) => project.name === name)) {
    throw new Error("Project identity is already registered.");
  }
  if (config.projects.some((project) => project.path === relativePath)) {
    throw new Error("Project path is already registered.");
  }

  const document = parseDocument(original);
  if (document.errors.length > 0) throw new Error("projects.yaml is invalid.");
  const projects = document.get("projects", true);
  if (!isSeq(projects)) {
    throw new Error("projects.yaml projects node is not a sequence.");
  }
  projects.add(projectConfig(name, type));

  try {
    writeFileSync(registryPath, document.toString({ lineWidth: 0 }), "utf8");
    const reparsed = parseYaml(readFileSync(registryPath, "utf8")) as Config;
    const registered = reparsed.projects.find((project) => project.name === name);
    if (!registered || registered.path !== relativePath || registered.type !== type) {
      throw new Error("Registered project failed post-write verification.");
    }
  } catch (error) {
    writeFileSync(registryPath, original, "utf8");
    throw error;
  }

  return {
    schemaVersion: 1,
    status: "registered",
    project: { name, type, path: target },
    registry: "projects.yaml",
  };
}

import { execSync } from "node:child_process";

import { type ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    }).trim();
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    return "Command failed.";
  }
}

function printBlock(title: string, content: string): void {
  terminal.section(title);

  if (content.trim().length === 0) {
    terminal.info("Empty.");
    return;
  }

  console.log(content);
}

export function printReviewContext(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  terminal.header(`Review • ${snapshot.project.name}`);
  terminal.info(`Project: ${snapshot.project.name}`);
  terminal.info(`Path: ${snapshot.project.path}`);

  if (!snapshot.git.requiresGit) {
    terminal.warning("Git repository not required.");
  } else {
    printBlock("Git status", run("git status --short", snapshot.project.path));
    printBlock("Diff stat", run("git diff --stat", snapshot.project.path));
    printBlock("Diff", run("git diff", snapshot.project.path));
  }

  terminal.section("Validation");
  if (!snapshot.validation.configured) {
    terminal.warning("No validation command configured.");
  } else {
    for (const command of snapshot.validation.commands) {
      terminal.success(command);
    }
  }

  terminal.section("Review rules");
  terminal.info("Check architecture boundaries.");
  terminal.info("Check TypeScript strictness.");
  terminal.info("Check absence of unnecessary dependencies.");
  terminal.info("Check validation commands before commit.");
  terminal.info("Prefer small, reversible changes.");
}


export function printReviewContextJson(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  const gitStatus = snapshot.git.requiresGit
    ? run("git status --short", snapshot.project.path)
    : "";

  const diffStat = snapshot.git.requiresGit
    ? run("git diff --stat", snapshot.project.path)
    : "";

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        project: snapshot.project,
        git: snapshot.git,
        gitStatus,
        diffStat,
        validation: snapshot.validation,
        health: snapshot.health,
      },
    ),
  );
}

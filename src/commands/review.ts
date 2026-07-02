import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
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
  const projectPath = resolve(project.path);

  terminal.header(`Review • ${project.name}`);
  terminal.info(`Project: ${project.name}`);
  terminal.info(`Path: ${projectPath}`);

  printBlock("Git status", run("git status --short", projectPath));
  printBlock("Diff stat", run("git diff --stat", projectPath));
  printBlock("Diff", run("git diff", projectPath));

  terminal.section("Validation");
  if (project.validation.length === 0) {
    terminal.warning("No validation command configured.");
  } else {
    for (const command of project.validation) {
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

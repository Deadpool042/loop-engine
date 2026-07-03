import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Config } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { isGitRepository } from "../core/git.js";
import { terminal } from "../ui/terminal.js";

export function printDoctor(config: Config): void {
  let hasError = false;

  terminal.header("Doctor");

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const projectExists = existsSync(projectPath);
    const gitDirExists = isGitRepository(projectPath);

    terminal.section(project.name);
    terminal.info(`Path: ${projectPath}`);

    if (!projectExists) {
      hasError = true;
      terminal.error("Project path does not exist");
      continue;
    }

    if (project.requires_git === false) {
      terminal.warning("Git repository not required");
    } else if (!gitDirExists) {
      hasError = true;
      terminal.error("Project is not a Git repository");
    } else {
      terminal.success("Git repository detected");
    }

    for (const doc of project.required_docs) {
      const exists = docExists(projectPath, doc);
      if (!exists) {
        if (project.optional === true) {
          terminal.warning(`${doc} missing`);
        } else {
          hasError = true;
          terminal.error(`${doc} missing`);
        }
      } else {
        terminal.success(`${doc}`);
      }
    }

    if (project.validation.length === 0) {
      terminal.warning("No validation command configured");
    } else {
      terminal.success(`${project.validation.length} validation command(s) configured`);
    }
  }

  if (hasError) {
    process.exitCode = 1;
  }
}

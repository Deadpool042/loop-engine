import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { printProjectContext } from "./commands/context.js";
import { validateProject } from "./commands/validate.js";
import { printReviewContext } from "./commands/review.js";
import { printWorkspaceSummary } from "./commands/summary.js";
import { loadConfig } from "./core/config.js";
import { docExists } from "./core/docs.js";
import { getGitBranch, getGitState, isGitRepository } from "./core/git.js";
import { findProject, getRequiredProjectName } from "./core/project.js";
import { terminal } from "./ui/terminal.js";

function status(): void {
  const config = loadConfig();

  terminal.header("Status");

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const branch = getGitBranch(projectPath);
    const state = getGitState(projectPath);

    terminal.section(project.name);
    terminal.info(`Path: ${projectPath}`);
    terminal.info(`Type: ${project.type}`);

    if (project.requires_git === false) {
      terminal.warning("Git: not required");
    } else if (state === "clean") {
      terminal.success(`Git: ${branch} / clean`);
    } else {
      terminal.warning(`Git: ${branch} / dirty`);
    }

    terminal.info("Docs:");
    for (const doc of project.required_docs) {
      const exists = docExists(projectPath, doc);
      if (exists) {
        terminal.success(doc);
      } else if (project.optional === true) {
        terminal.warning(`${doc} missing`);
      } else {
        terminal.error(`${doc} missing`);
      }
    }

    terminal.info("Validation:");
    if (project.validation.length === 0) {
      terminal.warning("No validation command configured");
    } else {
      for (const command of project.validation) {
        terminal.success(command);
      }
    }
  }
}

function doctor(): void {
  const config = loadConfig();
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

const command = process.argv[2];

if (command === "status") {
  status();
} else if (command === "summary") {
  printWorkspaceSummary(loadConfig());
} else if (command === "doctor") {
  doctor();
} else if (command === "context") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "context");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printProjectContext(project);
} else if (command === "validate") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "validate");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  await validateProject(project);
} else if (command === "review") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "review");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printReviewContext(project);
} else {
  terminal.error("Usage: pnpm loop status|summary|doctor|context <project>|validate <project>|review <project>");
  process.exit(1);
}

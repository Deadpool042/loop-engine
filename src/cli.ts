import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { printProjectContext } from "./commands/context.js";
import { validateProject } from "./commands/validate.js";
import { loadConfig } from "./core/config.js";
import { docExists } from "./core/docs.js";
import { getGitBranch, getGitState, isGitRepository } from "./core/git.js";
import { terminal } from "./ui/terminal.js";

function status(): void {
  const config = loadConfig();

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const branch = getGitBranch(projectPath);
    const state = getGitState(projectPath);

    console.log(`\n${project.name}`);
    console.log(`Path: ${projectPath}`);
    console.log(`Type: ${project.type}`);
    console.log(`Git: ${branch} / ${state}`);

    console.log("Docs:");
    for (const doc of project.required_docs) {
      const exists = docExists(projectPath, doc);
      console.log(`- ${exists ? "OK" : "MISSING"} ${doc}`);
    }

    console.log("Validation:");
    if (project.validation.length === 0) {
      console.log("- none");
    } else {
      for (const command of project.validation) {
        console.log(`- ${command}`);
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

    if (!gitDirExists) {
      hasError = true;
      terminal.error("Project is not a Git repository");
    } else {
      terminal.success("Git repository detected");
    }

    for (const doc of project.required_docs) {
      const exists = docExists(projectPath, doc);
      if (!exists) {
        hasError = true;
        terminal.error(`${doc} missing`);
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
} else if (command === "doctor") {
  doctor();
} else if (command === "context") {
  const projectName = process.argv[3];

  if (!projectName) {
    console.error("Usage: pnpm loop context <project>");
    process.exit(1);
  }

  const config = loadConfig();
  const project = config.projects.find((candidate) => candidate.name === projectName);

  if (!project) {
    console.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printProjectContext(project);
} else if (command === "validate") {
  const projectName = process.argv[3];

  if (!projectName) {
    console.error("Usage: pnpm loop validate <project>");
    process.exit(1);
  }

  const config = loadConfig();
  const project = config.projects.find((candidate) => candidate.name === projectName);

  if (!project) {
    console.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  await validateProject(project);
} else {
  console.error("Usage: pnpm loop status|doctor|context <project>|validate <project>");
  process.exit(1);
}

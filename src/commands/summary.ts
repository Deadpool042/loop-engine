import { resolve } from "node:path";

import { type Config } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { getGitState } from "../core/git.js";
import { terminal } from "../ui/terminal.js";

function formatGit(configProject: Config["projects"][number], projectPath: string): string {
  if (configProject.requires_git === false) {
    return "no git";
  }

  return getGitState(projectPath);
}

function formatDocs(configProject: Config["projects"][number], projectPath: string): string {
  const missingDocs = configProject.required_docs.filter((doc) => !docExists(projectPath, doc));

  if (missingDocs.length === 0) {
    return "docs OK";
  }

  return `${missingDocs.length} doc(s) missing`;
}

export function printWorkspaceSummary(config: Config): void {
  terminal.header("Summary");

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const git = formatGit(project, projectPath);
    const docs = formatDocs(project, projectPath);
    const validationCount = project.validation.length;

    const statusIcon = git === "clean" && docs === "docs OK" ? "✓" : "⚠";

    console.log(
      `${statusIcon} ${project.name.padEnd(12)} ${git.padEnd(8)} ${docs.padEnd(18)} validations ${validationCount}`,
    );
  }
}

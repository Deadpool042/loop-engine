import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { getGitBranch, getGitState } from "../core/git.js";
import { type ProjectSnapshot } from "./snapshot.js";

export function buildProjectSnapshot(
  project: ProjectConfig,
): ProjectSnapshot {
  const projectPath = resolve(project.path);

  const missingDocs = project.required_docs.filter(
    (doc) => !docExists(projectPath, doc),
  );

  const clean =
    project.requires_git === false
      ? true
      : getGitState(projectPath) === "clean";

  const branch =
    project.requires_git === false
      ? "n/a"
      : getGitBranch(projectPath);

  const health: ProjectSnapshot["health"] =
    missingDocs.length === 0 ? "good" : "warning";

  return {
    project: {
      name: project.name,
      type: project.type,
      path: projectPath,
    },

    git: {
      branch,
      clean,
      requiresGit: project.requires_git !== false,
    },

    docs: {
      required: project.required_docs,
      missing: missingDocs,
    },

    validation: {
      commands: project.validation,
      configured: project.validation.length > 0,
    },

    health,
  };
}

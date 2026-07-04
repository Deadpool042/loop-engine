import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { getGitBranch, getGitState, getGitStatusText, getLastCommit } from "../core/git.js";
import { findRoadmapCandidates, selectRoadmapCandidate } from "./roadmap.js";
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

  const statusText =
    project.requires_git === false
      ? ""
      : getGitStatusText(projectPath);

  const lastCommit =
    project.requires_git === false
      ? null
      : getLastCommit(projectPath);

  const roadmapPaths = project.roadmap ?? [];

  const roadmapAvailable = roadmapPaths.length > 0;

  const roadmapCandidates = findRoadmapCandidates(project, projectPath);
  const selectedRoadmapCandidate = selectRoadmapCandidate(roadmapCandidates);

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
      statusText,
      lastCommit,
    },

    docs: {
      required: project.required_docs,
      missing: missingDocs,
    },

    validation: {
      commands: project.validation,
      configured: project.validation.length > 0,
    },

    roadmap: {
      available: roadmapAvailable,
      paths: roadmapPaths,
      candidates: roadmapCandidates,
      selectedCandidate: selectedRoadmapCandidate,
    },

    health,
  };
}

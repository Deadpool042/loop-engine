import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { docExists } from "../core/docs.js";
import {
  getGitBranch,
  getGitState,
  getGitStatusText,
  getLastCommit,
} from "../core/git.js";
import { analyzeRoadmaps, selectRoadmapCandidate } from "./roadmap.js";
import { buildObjectiveStatus } from "./objective.js";
import { buildPlanningStatus } from "./planning.js";
import { type ProjectSnapshot } from "./snapshot.js";

export function buildProjectSnapshot(project: ProjectConfig): ProjectSnapshot {
  const projectPath = resolve(project.path);

  const missingDocs = project.required_docs.filter(
    (doc) => !docExists(projectPath, doc),
  );

  const clean =
    project.requires_git === false
      ? true
      : getGitState(projectPath) === "clean";

  const branch =
    project.requires_git === false ? "n/a" : getGitBranch(projectPath);

  const statusText =
    project.requires_git === false ? "" : getGitStatusText(projectPath);

  const lastCommit =
    project.requires_git === false ? null : getLastCommit(projectPath);

  const roadmapPaths = project.roadmap ?? [];

  const roadmapAvailable = roadmapPaths.length > 0;

  const roadmapAnalysis = analyzeRoadmaps(project, projectPath);
  const roadmapCandidates = roadmapAnalysis.candidates;
  const selectableRoadmapCandidates = roadmapCandidates.filter(
    (candidate) =>
      candidate.status !== "unknown" &&
      candidate.admissibility?.state !== "not_admissible",
  );
  const selectedRoadmapCandidate = selectRoadmapCandidate(
    selectableRoadmapCandidates,
  );

  const roadmapStats = {
    total: roadmapCandidates.length,
    todo: roadmapCandidates.filter((candidate) => candidate.status === "todo")
      .length,
    inProgress: roadmapCandidates.filter(
      (candidate) => candidate.status === "in_progress",
    ).length,
    done: roadmapCandidates.filter((candidate) => candidate.status === "done")
      .length,
    unknown: roadmapCandidates.filter(
      (candidate) => candidate.status === "unknown",
    ).length,
    safe: roadmapCandidates.filter((candidate) => candidate.kind === "safe")
      .length,
    warning: roadmapCandidates.filter(
      (candidate) => candidate.kind === "warning",
    ).length,
    blocked: roadmapCandidates.filter(
      (candidate) => candidate.kind === "blocked",
    ).length,
  };

  const roadmapSummary = {
    active: roadmapStats.total - roadmapStats.done,
    done: roadmapStats.done,
    selectable: selectableRoadmapCandidates.filter(
      (candidate) => candidate.status !== "done",
    ).length,
    hasBlocked: roadmapStats.blocked > 0,
  };

  const planning = buildPlanningStatus({
    project,
    projectPath,
    selectedCandidate: selectedRoadmapCandidate,
  });

  const objective = buildObjectiveStatus({
    project,
    projectPath,
    mode: planning.mode,
  });

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

    planning,
    objective,

    roadmap: {
      available: roadmapAvailable,
      paths: roadmapPaths,
      candidates: roadmapCandidates,
      phaseGates: roadmapAnalysis.phaseGates,
      selectedCandidate: selectedRoadmapCandidate,
      stats: roadmapStats,
      summary: roadmapSummary,
    },

    health,
  };
}

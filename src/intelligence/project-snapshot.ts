import { existsSync } from "node:fs";
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
import { buildPlanningStatus, resolvePlanningMode } from "./planning.js";
import { type ProjectSnapshot } from "./snapshot.js";

export function buildProjectSnapshot(project: ProjectConfig): ProjectSnapshot {
  const projectPath = resolve(project.path);
  const workspaceMode = project.workspace?.mode ?? "permanent";
  const dependencyMode = project.workspace?.dependencies ?? "none";
  const materialized = existsSync(projectPath);
  const expectedAbsent =
    !materialized && (workspaceMode === "on_demand" || workspaceMode === "none");

  const missingDocs = expectedAbsent
    ? []
    : project.required_docs.filter((doc) => !docExists(projectPath, doc));

  const bypassGit = project.requires_git === false || expectedAbsent;
  const clean = bypassGit ? true : getGitState(projectPath) === "clean";
  const branch = bypassGit ? "n/a" : getGitBranch(projectPath);
  const statusText = bypassGit ? "" : getGitStatusText(projectPath);
  const lastCommit = bypassGit ? null : getLastCommit(projectPath);

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

  const objective = buildObjectiveStatus({
    project,
    projectPath,
    mode: resolvePlanningMode(project),
  });

  const planning = buildPlanningStatus({
    project,
    projectPath,
    selectedCandidate: selectedRoadmapCandidate,
    candidates: roadmapCandidates,
    objectiveAvailable: objective.available,
    worktreeClean: clean,
  });

  const health: ProjectSnapshot["health"] =
    missingDocs.length === 0 ? "good" : "warning";

  return {
    project: {
      name: project.name,
      type: project.type,
      path: projectPath,
    },

    workspace: {
      mode: workspaceMode,
      dependencies: dependencyMode,
      materialized,
      expectedAbsent,
      repository: project.repository ?? null,
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

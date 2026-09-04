import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export const PLANNING_MODES = [
  "roadmap",
  "maintenance",
  "deferred",
  "external",
] as const;

export type PlanningMode = (typeof PLANNING_MODES)[number];
export type EffectivePlanningMode = PlanningMode | null;
export type PlanningRecommendation =
  | "roadmap_configured"
  | "connect_discovered_roadmap"
  | "no_roadmap_present"
  | "maintenance_no_work"
  | "deferred_no_work"
  | "external_planning_source"
  | "roadmap_exhausted_objective_available"
  | "worktree_dirty_review_required"
  | "objective_required"
  | "gated_no_work"
  | "no_admissible_candidate";

export type PlanningStatus = Readonly<{
  mode: EffectivePlanningMode;
  roadmapConfigured: boolean;
  configuredPaths: readonly string[];
  discoveredPaths: readonly string[];
  voluntaryNoWork: boolean;
  recommendation: PlanningRecommendation;
}>;

const CONVENTIONAL_ROADMAP_PATHS = [
  "roadmap.md",
  "roadmap/README.md",
  "roadmap/workflow-roadmap.md",
  "docs/roadmap/README.md",
] as const;

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolvePlanningMode(
  project: ProjectConfig,
): EffectivePlanningMode {
  if (project.planning?.mode) return project.planning.mode;
  return project.roadmap?.length ? "roadmap" : null;
}

/**
 * Finds only conventional roadmap files below a declared project root.
 * It never accepts a caller path and never reads roadmap contents.
 */
export function discoverConventionalRoadmaps(
  projectPath: string,
  configuredPaths: readonly string[],
): readonly string[] {
  return Object.freeze(
    CONVENTIONAL_ROADMAP_PATHS.filter(
      (path) =>
        !configuredPaths.includes(path) && isFile(resolve(projectPath, path)),
    ),
  );
}

export function buildPlanningStatus(options: Readonly<{
  project: ProjectConfig;
  projectPath: string;
  selectedCandidate: unknown | null;
  candidates?: readonly Readonly<{
    status: "todo" | "in_progress" | "done" | "unknown";
    admissibility?: Readonly<{
      state: "admissible" | "not_admissible";
      reason: "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
    }>;
  }>[];
  objectiveAvailable?: boolean;
  worktreeClean?: boolean;
}>): PlanningStatus {
  const configuredPaths = Object.freeze([...(options.project.roadmap ?? [])]);
  const roadmapConfigured = configuredPaths.length > 0;
  const discoveredPaths = discoverConventionalRoadmaps(
    options.projectPath,
    configuredPaths,
  );
  const mode = resolvePlanningMode(options.project);

  if (mode === "maintenance") {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: true,
      recommendation: "maintenance_no_work",
    });
  }

  if (mode === "deferred") {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: true,
      recommendation: "deferred_no_work",
    });
  }

  if (mode === "external") {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "external_planning_source",
    });
  }

  if (discoveredPaths.length > 0) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "connect_discovered_roadmap",
    });
  }

  if (!roadmapConfigured) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "no_roadmap_present",
    });
  }

  if (options.worktreeClean === false) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "worktree_dirty_review_required",
    });
  }

  if (options.selectedCandidate !== null) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "roadmap_configured",
    });
  }

  const knownOpenCandidates = (options.candidates ?? []).filter(
    (candidate) =>
      candidate.status === "todo" || candidate.status === "in_progress",
  );
  if (
    knownOpenCandidates.length > 0 &&
    knownOpenCandidates.every(
      (candidate) =>
        candidate.admissibility?.state === "not_admissible" &&
        candidate.admissibility.reason === "phase_closed",
    )
  ) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "gated_no_work",
    });
  }

  if (knownOpenCandidates.length === 0 && options.objectiveAvailable === false) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "objective_required",
    });
  }

  if (knownOpenCandidates.length === 0 && options.objectiveAvailable === true) {
    return Object.freeze({
      mode,
      roadmapConfigured,
      configuredPaths,
      discoveredPaths,
      voluntaryNoWork: false,
      recommendation: "roadmap_exhausted_objective_available",
    });
  }

  return Object.freeze({
    mode,
    roadmapConfigured,
    configuredPaths,
    discoveredPaths,
    voluntaryNoWork: false,
    recommendation: "no_admissible_candidate",
  });
}

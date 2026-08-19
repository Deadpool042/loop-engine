import { readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { type EffectivePlanningMode } from "./planning.js";

export const MAX_OBJECTIVE_SOURCE_BYTES = 64 * 1024;

export type ObjectiveReason =
  | "planning_mode_maintenance"
  | "planning_mode_deferred"
  | "planning_mode_external"
  | "planning_mode_not_roadmap"
  | "objective_source_not_configured"
  | "objective_source_outside_project_root"
  | "objective_source_missing"
  | "objective_source_not_file"
  | "objective_source_unreadable"
  | "objective_source_too_large";

export type ObjectiveStatus = Readonly<{
  source: string | null;
  available: boolean;
  eligibleForRoadmapProposal: boolean;
  reason?: ObjectiveReason;
  content?: string;
}>;

function isWithinProjectRoot(projectRoot: string, targetPath: string): boolean {
  const pathFromRoot = relative(projectRoot, targetPath);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/"))
  );
}

function unavailable(
  source: string | null,
  reason: ObjectiveReason,
): ObjectiveStatus {
  return Object.freeze({
    source,
    available: false,
    eligibleForRoadmapProposal: false,
    reason,
  });
}

/**
 * Loads exactly one configured project-relative objective document.
 * This function never scans a project directory or interprets Markdown.
 */
export function buildObjectiveStatus(options: Readonly<{
  project: ProjectConfig;
  projectPath: string;
  mode: EffectivePlanningMode;
}>): ObjectiveStatus {
  const source = options.project.planning?.objective_source ?? null;

  switch (options.mode) {
    case "maintenance":
      return unavailable(source, "planning_mode_maintenance");
    case "deferred":
      return unavailable(source, "planning_mode_deferred");
    case "external":
      return unavailable(source, "planning_mode_external");
    case null:
      return unavailable(source, "planning_mode_not_roadmap");
    case "roadmap":
      break;
  }

  if (source === null) {
    return unavailable(null, "objective_source_not_configured");
  }

  const resolvedProjectRoot = resolve(options.projectPath);
  const resolvedSource = resolve(resolvedProjectRoot, source);
  if (!isWithinProjectRoot(resolvedProjectRoot, resolvedSource)) {
    return unavailable(source, "objective_source_outside_project_root");
  }

  try {
    const sourceStats = statSync(resolvedSource);
    if (!sourceStats.isFile()) {
      return unavailable(source, "objective_source_not_file");
    }
    if (sourceStats.size > MAX_OBJECTIVE_SOURCE_BYTES) {
      return unavailable(source, "objective_source_too_large");
    }

    const canonicalProjectRoot = realpathSync(resolvedProjectRoot);
    const canonicalSource = realpathSync(resolvedSource);
    if (!isWithinProjectRoot(canonicalProjectRoot, canonicalSource)) {
      return unavailable(source, "objective_source_outside_project_root");
    }

    const content = readFileSync(canonicalSource, "utf8");
    return Object.freeze({
      source,
      available: true,
      eligibleForRoadmapProposal: true,
      content,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return unavailable(source, "objective_source_missing");
    }
    return unavailable(source, "objective_source_unreadable");
  }
}

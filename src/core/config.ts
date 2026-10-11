import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export const WORKSPACE_MATERIALIZATION_MODES = [
  "permanent",
  "source_only",
  "on_demand",
  "none",
] as const;
export type WorkspaceMaterializationMode =
  (typeof WORKSPACE_MATERIALIZATION_MODES)[number];

export const WORKSPACE_DEPENDENCY_MODES = [
  "none",
  "on_demand",
  "production",
] as const;
export type WorkspaceDependencyMode =
  (typeof WORKSPACE_DEPENDENCY_MODES)[number];

export type ProjectConfig = {
  name: string;
  path: string;
  /**
   * Optional alternative checkout locations, relative to the process cwd like
   * `path`. Used only when `path` is not an exact-case directory on this host
   * (e.g. the VPS layout `../CREATYSS` vs the Mac layout `../creatyss`).
   */
  path_aliases?: string[];
  type: string;
  archived?: boolean;
  /** Tombstone: identity burned after a full hard-delete; implies archived, never reusable. */
  retired?: boolean;
  required_docs: string[];
  validation: string[];
  roadmap?: string[];
  optional?: boolean;
  requires_git?: boolean;
  repository?: string;
  workspace?: {
    mode: WorkspaceMaterializationMode;
    dependencies?: WorkspaceDependencyMode;
  };
  // Opt-in, project-relative path to an explicit, SHA-bound execution
  // authorization file (see src/governance/execution-decision.ts).
  execution_decision?: string;
  planning?: {
    mode: "roadmap" | "maintenance" | "deferred" | "external";
    /** One project-relative canonical objective document. */
    objective_source?: string;
  };
};

export type Config = {
  workspace_policy?: {
    min_free_disk_gib?: number;
  };
  projects: ProjectConfig[];
};

/** Exact-case existence: stays true on case-sensitive hosts, and does not trust case-insensitive APFS. */
function existsExactCase(candidate: string): boolean {
  const absolute = resolve(candidate);
  const parent = dirname(absolute);
  if (parent === absolute) return true;
  try {
    return readdirSync(parent).includes(basename(absolute));
  } catch {
    return false;
  }
}

/**
 * Picks the first existing candidate among `path` then `path_aliases`.
 * Falls back to the declared `path` unchanged so existing failures stay identical.
 */
export function resolveProjectPath(
  project: Pick<ProjectConfig, "path" | "path_aliases">,
  exists: (candidate: string) => boolean = existsExactCase,
): string {
  if (!Array.isArray(project.path_aliases) || project.path_aliases.length === 0) {
    return project.path;
  }
  const candidates = [project.path, ...project.path_aliases];
  return candidates.find((candidate) => exists(candidate)) ?? project.path;
}

export function loadConfig(): Config {
  const raw = readFileSync("projects.yaml", "utf8");
  const config = parseYaml(raw) as Config;
  if (Array.isArray(config?.projects)) {
    for (const project of config.projects) {
      project.path = resolveProjectPath(project);
    }
  }
  return config;
}

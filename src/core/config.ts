import { readFileSync } from "node:fs";
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
  type: string;
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

export function loadConfig(): Config {
  const raw = readFileSync("projects.yaml", "utf8");
  return parseYaml(raw) as Config;
}

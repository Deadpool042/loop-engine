import { readFileSync } from "node:fs";
import YAML from "yaml";

export type ProjectConfig = {
  name: string;
  path: string;
  type: string;
  required_docs: string[];
  validation: string[];
  roadmap?: string[];
  optional?: boolean;
  requires_git?: boolean;
  // Opt-in, project-relative path to an explicit, SHA-bound execution
  // authorization file (see src/governance/execution-decision.ts).
  execution_decision?: string;
};

export type Config = {
  projects: ProjectConfig[];
};

export function loadConfig(): Config {
  const raw = readFileSync("projects.yaml", "utf8");
  return YAML.parse(raw) as Config;
}

import { readFileSync } from "node:fs";
import YAML from "yaml";

export type ProjectConfig = {
  name: string;
  path: string;
  type: string;
  required_docs: string[];
  validation: string[];
  optional?: boolean;
  requires_git?: boolean;
};

export type Config = {
  projects: ProjectConfig[];
};

export function loadConfig(): Config {
  const raw = readFileSync("projects.yaml", "utf8");
  return YAML.parse(raw) as Config;
}

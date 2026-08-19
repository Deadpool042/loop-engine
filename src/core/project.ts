import { type Config, type ProjectConfig } from "./config.js";

export function findProject(
  config: Config,
  projectName: string,
): ProjectConfig | null {
  return (
    config.projects.find((candidate) => candidate.name === projectName) ?? null
  );
}

export function getRequiredProjectName(
  args: string[],
  command: string,
  argumentIndex = 3,
): string {
  const projectName = args[argumentIndex];

  if (!projectName) {
    throw new Error(`Usage: pnpm loop ${command} <project>`);
  }

  return projectName;
}

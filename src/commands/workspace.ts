import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

function projectWorkspaceSnapshot(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
) {
  const snapshot = application.generateProjectReport(project);
  return {
    project: snapshot.project,
    workspace: snapshot.workspace,
    health: snapshot.health,
  };
}

export function printWorkspaceProjectStatusJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      ...projectWorkspaceSnapshot(application, project),
    }),
  );
}

export function printWorkspaceProjectStatus(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const snapshot = projectWorkspaceSnapshot(application, project);
  terminal.header(`Workspace • ${snapshot.project.name}`);
  terminal.info(`Mode: ${snapshot.workspace.mode}`);
  terminal.info(`Dependencies: ${snapshot.workspace.dependencies}`);
  terminal.info(`Materialized: ${snapshot.workspace.materialized ? "yes" : "no"}`);
  terminal.info(`Expected absent: ${snapshot.workspace.expectedAbsent ? "yes" : "no"}`);
  terminal.info(`Repository: ${snapshot.workspace.repository ?? "not configured"}`);
  terminal.info(`Path: ${snapshot.project.path}`);
  terminal.info(`Health: ${snapshot.health}`);
}

export function printWorkspacePortfolioStatusJson(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      projects: config.projects.map((project) =>
        projectWorkspaceSnapshot(application, project),
      ),
    }),
  );
}

export function materializeWorkspaceProjectCommand(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
  project: LoopApplicationProject,
  json: boolean,
): number {
  const result = application.materializeWorkspaceProject(config, project);
  if (json) console.log(JSON.stringify(result));
  else if (result.status === "failed")
    terminal.error(`${project.name}: ${result.reason ?? "materialization_failed"}`);
  else terminal.info(`${project.name}: ${result.status}`);
  return result.status === "failed" ? 1 : 0;
}

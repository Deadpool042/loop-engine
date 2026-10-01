import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function setProjectRepositoryCommand(
  application: LoopApplicationAssembly,
  loopEngineRoot: string,
  name: string,
  repository: string,
  confirmSetRepository: true,
  json: boolean,
): number {
  try {
    const result = application.setProjectRepository(
      loopEngineRoot,
      name,
      repository,
      confirmSetRepository,
    );
    if (json) console.log(JSON.stringify(result));
    else terminal.success(name + ": repository recorded in projects.yaml");
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Project set-repository failed.";
    if (json) printJsonError("project_set_repository_failed", message);
    else terminal.error(message);
    return 1;
  }
}

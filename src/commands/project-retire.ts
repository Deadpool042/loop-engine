import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function retireProjectCommand(
  application: LoopApplicationAssembly,
  loopEngineRoot: string,
  name: string,
  confirmRetire: true,
  json: boolean,
): number {
  try {
    const result = application.retireProject(loopEngineRoot, name, confirmRetire);
    if (json) console.log(JSON.stringify(result));
    else terminal.success(name + ": identity retired in projects.yaml");
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Project retire failed.";
    if (json) printJsonError("project_retire_failed", message);
    else terminal.error(message);
    return 1;
  }
}

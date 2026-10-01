import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function archiveProjectCommand(
  application: LoopApplicationAssembly,
  loopEngineRoot: string,
  name: string,
  confirmArchive: true,
  json: boolean,
): number {
  try {
    const result = application.archiveProject(
      loopEngineRoot,
      name,
      confirmArchive,
    );
    if (json) console.log(JSON.stringify(result));
    else terminal.success(name + ": archived in projects.yaml");
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Project archive failed.";
    if (json) printJsonError("project_archive_failed", message);
    else terminal.error(message);
    return 1;
  }
}

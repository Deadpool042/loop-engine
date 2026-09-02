import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function registerProjectEnvelopeCommand(
  application: LoopApplicationAssembly,
  loopEngineRoot: string,
  name: string,
  type: string,
  confirmBriefApproved: true,
  json: boolean,
): number {
  try {
    const result = application.registerProjectEnvelope(
      loopEngineRoot,
      name,
      type,
      confirmBriefApproved,
    );
    if (json) console.log(JSON.stringify(result));
    else terminal.success(`${name}: registered in projects.yaml`);
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Project registration failed.";
    if (json) printJsonError("project_registration_failed", message);
    else terminal.error(message);
    return 1;
  }
}

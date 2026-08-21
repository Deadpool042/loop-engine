import type { LoopApplicationAssembly } from "../composition/index.js";

export function printExecutionDecisionCurrentJson(application: LoopApplicationAssembly, project: string): void { console.log(JSON.stringify(application.getExecutionDecisionCurrentReport(project))); }

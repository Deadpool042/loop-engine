import { getCurrentExecutionDecisionState } from "../governance/execution-decision-production.js";

export type ExecutionDecisionCurrentCliReport = Readonly<{ schemaVersion: 1; project: string; current: Readonly<{ project: string; projectPath: string; candidateId: string; gitHead: string; sourceDocument: string; executionDecisionPath: string }> | null }>;
export function getExecutionDecisionCurrentReport(project: string): ExecutionDecisionCurrentCliReport {
  const current = getCurrentExecutionDecisionState(project);
  return { schemaVersion: 1, project, current: current === null ? null : { project: current.project, projectPath: current.projectPath, candidateId: current.candidateId, gitHead: current.gitHead, sourceDocument: current.sourceDocument, executionDecisionPath: current.executionDecisionPath } };
}

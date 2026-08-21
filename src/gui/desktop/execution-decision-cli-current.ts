import type { ExecutionDecisionCurrent } from "../../governance/execution-decision-service.js";
import { ExecutionDecisionPreparationPassthroughFailure } from "../../governance/execution-decision-errors.js";
import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export const DESKTOP_EXECUTION_DECISION_CURRENT_TIMEOUT_MS = 15_000;
export class ExecutionDecisionCurrentCliFailure extends ExecutionDecisionPreparationPassthroughFailure { constructor(readonly code: "repository_unavailable" | "execution_decision_current_spawn_failed" | "execution_decision_current_timeout" | "execution_decision_current_response_invalid") { super(); this.message = code; this.name = "ExecutionDecisionCurrentCliFailure"; } }
const SHA = /^[0-9a-f]{40}$/i;
function only(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function parse(value: unknown, expectedProject: string): ExecutionDecisionCurrent | null | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const root = value as Record<string, unknown>; if (root.schemaVersion !== 1 || root.project !== expectedProject || !only(root, ["schemaVersion", "project", "current"])) return undefined;
  if (root.current === null) return null;
  if (typeof root.current !== "object" || root.current === null || Array.isArray(root.current)) return undefined;
  const current = root.current as Record<string, unknown>;
  if (!only(current, ["project", "projectPath", "candidateId", "gitHead", "sourceDocument", "executionDecisionPath"]) || current.project !== expectedProject || typeof current.projectPath !== "string" || typeof current.candidateId !== "string" || typeof current.gitHead !== "string" || typeof current.sourceDocument !== "string" || typeof current.executionDecisionPath !== "string" || !SHA.test(current.gitHead) || [current.projectPath, current.candidateId, current.sourceDocument, current.executionDecisionPath].some((value) => value.trim().length === 0)) return undefined;
  return current as ExecutionDecisionCurrent;
}
export function createCliExecutionDecisionCurrent(options: Readonly<{ cliInvoker: CliInvoker; resolveRepositoryPath: () => string | null }>): (projectName: string) => Promise<ExecutionDecisionCurrent | null> {
  return async (projectName) => {
    const repositoryPath = options.resolveRepositoryPath(); if (repositoryPath === null) throw new ExecutionDecisionCurrentCliFailure("repository_unavailable");
    let invocation: CliInvocationResult; try { invocation = await options.cliInvoker.invoke("execution-decision", ["current", projectName], repositoryPath); } catch { throw new ExecutionDecisionCurrentCliFailure("execution_decision_current_spawn_failed"); }
    if (!invocation.ok) throw new ExecutionDecisionCurrentCliFailure(invocation.kind === "timeout" ? "execution_decision_current_timeout" : "execution_decision_current_spawn_failed");
    const current = parse(invocation.json, projectName); if (current === undefined) throw new ExecutionDecisionCurrentCliFailure("execution_decision_current_response_invalid");
    return current;
  };
}

import {
  runLoopPlan as runLoopPlanImplementation,
  type LoopRunPlanOptions,
} from "../loop/runner.js";
import type { LoopRunResult } from "../loop/types.js";

/** Runs the plan-only LoopRunner through the stable Core boundary. */
export function runLoopPlan(
  projectName: string,
  options: LoopRunPlanOptions = {},
): LoopRunResult {
  return runLoopPlanImplementation(projectName, options);
}

/** Preserves the public execution-report JSON shape used by CLI adapters. */
export function generateExecutionReport(result: LoopRunResult): LoopRunResult {
  return {
    schemaVersion: 1,
    runId: result.runId,
    project: result.project,
    mode: result.mode,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    candidate: result.candidate,
    steps: result.steps,
    validation: result.validation,
    modifiedFiles: result.modifiedFiles,
    commit: result.commit,
    publication: result.publication,
    failure: result.failure,
    agentPolicy: result.agentPolicy,
    contextPackage: result.contextPackage,
  };
}

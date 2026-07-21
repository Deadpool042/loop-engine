import {
  runLoopPlan as runLoopPlanImplementation,
  type LoopRunPlanOptions,
} from "../loop/runner.js";
import type { LoopRunResult } from "../loop/types.js";
import {
  dryRunPolicyBoundLocalProcessExecution,
  type PolicyBoundLocalProcessBridgeInput,
  type RuntimeExecutionPlanDryRunResult,
} from "./runtime-execution-bridge.js";

export type PrepareLoopPolicyBoundLocalProcessExecutionResult = Readonly<{
  loopRunResult: LoopRunResult;
  runtimeDryRunResult: RuntimeExecutionPlanDryRunResult;
}>;

/** Runs the plan-only LoopRunner through the stable Core boundary. */
export function runLoopPlan(
  projectName: string,
  options: LoopRunPlanOptions = {},
): LoopRunResult {
  return runLoopPlanImplementation(projectName, options);
}

/**
 * Adds an explicit policy-bound local-process dry-run on top of the historical
 * Loop plan result without changing the public LoopRunResult contract.
 */
export function prepareLoopPolicyBoundLocalProcessExecution(
  projectName: string,
  bridgeInput: PolicyBoundLocalProcessBridgeInput,
  options: LoopRunPlanOptions = {},
): PrepareLoopPolicyBoundLocalProcessExecutionResult {
  const loopRunResult = runLoopPlanImplementation(projectName, options);
  const runtimeDryRunResult = dryRunPolicyBoundLocalProcessExecution({
    ...bridgeInput,
    loopRunResult,
  });

  return {
    loopRunResult,
    runtimeDryRunResult,
  };
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

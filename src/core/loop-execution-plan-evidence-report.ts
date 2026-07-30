import { generateExecutionReport } from "./loop.js";
import { projectLoopExecutionPlanEvidence } from "../loop/execution-plan-evidence.js";
import type { LoopRunResult } from "../loop/types.js";

/**
 * Produces the CLI-facing execution report with one bounded execution-plan
 * evidence projection. The historical report fields remain unchanged.
 */
export function generateExecutionReportWithEvidence(
  result: LoopRunResult,
): LoopRunResult {
  return Object.freeze({
    ...generateExecutionReport(result),
    executionPlanEvidence: projectLoopExecutionPlanEvidence(result.agentPolicy),
  });
}

import { generateExecutionReport } from "./loop.js";
import { projectLoopExecutionPlanEvidence } from "../loop/execution-plan-evidence.js";
import { fingerprintLoopExecutionPlanEvidence } from "../loop/execution-plan-evidence-fingerprint.js";
import type { LoopRunResult } from "../loop/types.js";

/**
 * Produces the CLI-facing execution report with one bounded execution-plan
 * evidence projection and its deterministic integrity fingerprint. Historical
 * report fields remain unchanged.
 */
export function generateExecutionReportWithEvidence(
  result: LoopRunResult,
): LoopRunResult {
  const evidence = projectLoopExecutionPlanEvidence(result.agentPolicy);
  return Object.freeze({
    ...generateExecutionReport(result),
    executionPlanEvidence: evidence,
    executionPlanFingerprint:
      evidence === null ? null : fingerprintLoopExecutionPlanEvidence(evidence),
  });
}

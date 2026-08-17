import { generateExecutionReport } from "./loop.js";
import { projectLoopExecutionPlanEvidence } from "../loop/execution-plan-evidence.js";
import { fingerprintLoopExecutionPlanEvidence } from "../loop/execution-plan-evidence-fingerprint.js";
import { fingerprintLoopProviderFailoverEvidence } from "../loop/provider-failover-evidence-integrity.js";
import type { LoopRunResult } from "../loop/types.js";

/**
 * Produces the CLI-facing execution report with bounded execution-plan and
 * provider-failover evidence plus deterministic integrity fingerprints.
 * Historical report fields remain unchanged.
 */
export function generateExecutionReportWithEvidence(
  result: LoopRunResult,
): LoopRunResult {
  const executionPlanEvidence = projectLoopExecutionPlanEvidence(
    result.agentPolicy,
    result.writableFileScope,
  );
  const providerFailoverEvidence = result.providerFailoverEvidence ?? null;

  return Object.freeze({
    ...generateExecutionReport(result),
    executionPlanEvidence,
    executionPlanFingerprint:
      executionPlanEvidence === null
        ? null
        : fingerprintLoopExecutionPlanEvidence(executionPlanEvidence),
    providerFailoverEvidence,
    providerFailoverFingerprint:
      providerFailoverEvidence === null
        ? null
        : fingerprintLoopProviderFailoverEvidence(providerFailoverEvidence),
  });
}

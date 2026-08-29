import type { LoopExecutionPlan } from "./execution-plan.js";
import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import {
  executeLoopProviderFailover,
  type LoopProviderFailureClassifier,
  type LoopProviderFailoverAttempt,
} from "./provider-failover.js";

export type LoopProviderFailoverAttemptResolver = (
  primaryPlan: LoopExecutionPlan,
) => readonly LoopProviderFailoverAttempt[];

function primaryMismatch(): LoopExecutorResult {
  return Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([]),
    failure: Object.freeze({
      code: "provider_primary_plan_mismatch",
      message:
        "The first failover attempt must preserve the admitted primary plan.",
      details: Object.freeze([
        "The resolver replaced or reordered the primary execution plan.",
      ]),
    }),
  });
}

/**
 * Creates the evidence-preserving executor facade used by application
 * composition. The returned result carries only bounded, redacted failover
 * evidence; provider diagnostics remain excluded.
 */
export function createEvidenceAwareProviderFailoverLoopExecutor(
  resolveAttempts: LoopProviderFailoverAttemptResolver,
  options: Readonly<{
    maxAttempts: number;
    isRecoverableFailure?: LoopProviderFailureClassifier;
  }>,
): LoopExecutor {
  return async (primaryPlan, cwd) => {
    const attempts = resolveAttempts(primaryPlan);
    if (attempts[0]?.plan !== primaryPlan) return primaryMismatch();

    const outcome = await executeLoopProviderFailover({
      attempts,
      maxAttempts: options.maxAttempts,
      cwd,
      ...(options.isRecoverableFailure === undefined
        ? {}
        : { isRecoverableFailure: options.isRecoverableFailure }),
    });

    return Object.freeze({
      ...outcome.result,
      providerFailoverEvidence: outcome.evidence,
    });
  };
}

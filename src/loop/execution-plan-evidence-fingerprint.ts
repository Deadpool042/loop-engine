import { createHash } from "node:crypto";

import type { LoopExecutionPlanEvidence } from "./execution-plan-evidence.js";

export const LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM = "sha256" as const;

export type LoopExecutionPlanFingerprint = Readonly<{
  algorithm: typeof LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM;
  value: string;
}>;

function canonicalStringArray(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort());
}

/**
 * Produces the stable, versioned payload covered by the public fingerprint.
 * Set-like policy arrays are sorted so equivalent admitted constraints yield
 * the same fingerprint regardless of incidental registry ordering.
 */
export function canonicalizeLoopExecutionPlanEvidence(
  evidence: LoopExecutionPlanEvidence,
): string {
  return JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    provider: evidence.provider,
    runtime: evidence.runtime,
    profileId: evidence.profileId,
    model: evidence.model,
    effort: evidence.effort,
    budget: evidence.budget,
    ...(evidence.allowedPaths === undefined
      ? {}
      : { allowedPaths: canonicalStringArray(evidence.allowedPaths) }),
    policy: {
      id: evidence.policy.id,
      mode: evidence.policy.mode,
      requiredCapabilities: canonicalStringArray(
        evidence.policy.requiredCapabilities,
      ),
      requiredPermissions: canonicalStringArray(
        evidence.policy.requiredPermissions,
      ),
      rationale: [...evidence.policy.rationale],
    },
  });
}

export function fingerprintLoopExecutionPlanEvidence(
  evidence: LoopExecutionPlanEvidence,
): LoopExecutionPlanFingerprint {
  return Object.freeze({
    algorithm: LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM,
    value: createHash(LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM)
      .update(canonicalizeLoopExecutionPlanEvidence(evidence), "utf8")
      .digest("hex"),
  });
}

export function verifyLoopExecutionPlanEvidenceFingerprint(
  evidence: LoopExecutionPlanEvidence,
  fingerprint: LoopExecutionPlanFingerprint,
): boolean {
  if (fingerprint.algorithm !== LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM) {
    return false;
  }

  return fingerprintLoopExecutionPlanEvidence(evidence).value === fingerprint.value;
}

import type {
  AuthorizationDecision,
  AuthorizationEvaluation,
  AuthorizationReason,
  AuthorizationStatus,
  CapabilityEvaluationResult,
  PolicyDecision,
} from "./types.js";

/** Creates a frozen, non-executing authorization decision. */
export function createAuthorizationDecision(
  evaluation: AuthorizationEvaluation,
  status: AuthorizationStatus,
  reason: AuthorizationReason,
  capabilityResult: CapabilityEvaluationResult,
  policyDecision: PolicyDecision,
  summary: AuthorizationDecision["summary"],
  diagnostics: readonly string[],
): AuthorizationDecision {
  return Object.freeze({
    status,
    reason,
    evaluation,
    summary: Object.freeze({ ...summary }),
    capabilityResult,
    policyDecision,
    diagnostics: Object.freeze([...diagnostics]),
    executionStarted: false,
  });
}

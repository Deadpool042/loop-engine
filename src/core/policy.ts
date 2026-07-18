import {
  createAuthorizationDecision as createDecision,
  evaluateAuthorization as evaluate,
  evaluateCapabilities as evaluateCapabilitySet,
  evaluatePolicies as evaluatePolicySet,
  type AuthorizationDecision,
  type AuthorizationEvaluation,
  type CapabilityEvaluationResult,
  type PolicyDecision,
} from "../policy/index.js";

/** Pure capability evaluation; it does not create a transport payload. */
export function evaluateCapabilities(
  evaluation: AuthorizationEvaluation,
): CapabilityEvaluationResult {
  return evaluateCapabilitySet(evaluation);
}

/** Pure static policy evaluation; it invokes no Provider, Runtime, or Transport. */
export function evaluatePolicies(
  evaluation: AuthorizationEvaluation,
): PolicyDecision {
  return evaluatePolicySet(evaluation);
}

/** Evaluates a theoretical authorization only. */
export function evaluateAuthorization(
  evaluation: AuthorizationEvaluation,
): AuthorizationDecision {
  return evaluate(evaluation);
}

export function createAuthorizationDecision(
  evaluation: AuthorizationEvaluation,
  status: AuthorizationDecision["status"],
  reason: AuthorizationDecision["reason"],
  capabilityResult: AuthorizationDecision["capabilityResult"],
  policyDecision: AuthorizationDecision["policyDecision"],
  summary: AuthorizationDecision["summary"],
  diagnostics: readonly string[],
): AuthorizationDecision {
  return createDecision(
    evaluation,
    status,
    reason,
    capabilityResult,
    policyDecision,
    summary,
    diagnostics,
  );
}

/** Returns an immutable snapshot with no executable payload fields. */
export function normalizeAuthorization(
  decision: AuthorizationDecision,
): AuthorizationDecision {
  return Object.freeze({
    ...decision,
    summary: Object.freeze({ ...decision.summary }),
    diagnostics: Object.freeze([...decision.diagnostics]),
    capabilityResult: Object.freeze({
      ...decision.capabilityResult,
      evaluations: Object.freeze([...decision.capabilityResult.evaluations]),
      metadata: Object.freeze({ ...decision.capabilityResult.metadata }),
    }),
    policyDecision: Object.freeze({
      ...decision.policyDecision,
      evaluations: Object.freeze([...decision.policyDecision.evaluations]),
      metadata: Object.freeze({ ...decision.policyDecision.metadata }),
    }),
  });
}

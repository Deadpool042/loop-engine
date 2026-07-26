import {
  allowInboundSecurity,
  denyInboundSecurity,
  indeterminateInboundSecurity,
} from "./errors.js";
import type {
  InboundSecurityDecision,
  InboundSecurityEvaluationInput,
} from "./types.js";
import {
  isEvidenceExpired,
  isEvidenceNotYetValid,
  isEvidenceVerified,
  principalMatchesEvidence,
} from "./validation.js";

/**
 * Pure, deterministic, fail-closed evaluation of the inbound security
 * contract. Never touches the clock, randomness, the filesystem, the
 * network, or a process — every input, including the evaluation time, is
 * supplied explicitly by the caller. Never infers permission from absent
 * data: any branch not explicitly reaching "allow" resolves to "deny" or
 * "indeterminate".
 */
export function evaluateInboundSecurity(
  input: InboundSecurityEvaluationInput,
  evaluatedAt: string,
): InboundSecurityDecision {
  const requestId = input.accessRequest.requestId;

  if (input.evidence === null) {
    return denyInboundSecurity(requestId, "authentication_missing");
  }

  if (!isEvidenceVerified(input.evidence)) {
    return denyInboundSecurity(requestId, "authentication_invalid");
  }

  if (isEvidenceNotYetValid(input.evidence, evaluatedAt)) {
    return denyInboundSecurity(requestId, "authentication_not_yet_valid");
  }

  if (isEvidenceExpired(input.evidence, evaluatedAt)) {
    return denyInboundSecurity(requestId, "authentication_expired");
  }

  if (input.principal === null) {
    return indeterminateInboundSecurity(requestId, "insufficient_evidence");
  }

  if (!principalMatchesEvidence(input.principal.principalId, input.evidence)) {
    return denyInboundSecurity(requestId, "principal_mismatch");
  }

  if (input.principal.principalId !== input.accessRequest.principalId) {
    return denyInboundSecurity(requestId, "principal_mismatch");
  }

  if (input.principal.tenantId !== input.accessRequest.tenantId) {
    return denyInboundSecurity(requestId, "tenant_mismatch");
  }

  if (!input.policy.allowedOperations.includes(input.accessRequest.operation)) {
    return denyInboundSecurity(requestId, "operation_not_allowed");
  }

  if (input.policy.replayCheckRequired) {
    if (input.replayEvidence === null) {
      return denyInboundSecurity(requestId, "replay_evidence_missing");
    }

    if (
      input.replayEvidence.replayed ||
      input.replayEvidence.requestId !== requestId ||
      input.replayEvidence.evidenceId !== input.evidence.evidenceId
    ) {
      return denyInboundSecurity(requestId, "replay_rejected");
    }
  }

  return allowInboundSecurity(requestId, input.principal.principalId);
}

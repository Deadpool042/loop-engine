import type { InboundAuthenticationEvidence } from "./types.js";

/**
 * Compares ISO 8601 instants as strings first (exact match is always valid),
 * falling back to a numeric comparison. Never reads the system clock —
 * `evaluatedAt` must always be supplied explicitly by the caller.
 */
function compareInstants(a: string, b: string): number {
  const parsedA = Date.parse(a);
  const parsedB = Date.parse(b);

  if (Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  return parsedA - parsedB;
}

export function isEvidenceVerified(
  evidence: InboundAuthenticationEvidence,
): boolean {
  return evidence.verified === true;
}

export function isEvidenceNotYetValid(
  evidence: InboundAuthenticationEvidence,
  evaluatedAt: string,
): boolean {
  return compareInstants(evaluatedAt, evidence.validFrom) < 0;
}

export function isEvidenceExpired(
  evidence: InboundAuthenticationEvidence,
  evaluatedAt: string,
): boolean {
  return compareInstants(evaluatedAt, evidence.expiresAt) > 0;
}

export function principalMatchesEvidence(
  principalId: string,
  evidence: InboundAuthenticationEvidence,
): boolean {
  return principalId === evidence.subjectId;
}

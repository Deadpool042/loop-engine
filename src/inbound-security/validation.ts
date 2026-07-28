import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationEvidence,
  InboundReplayEvidence,
} from "./types.js";

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

/**
 * Rejects only an internally contradictory validity window
 * (`validFrom > expiresAt`). Equal bounds remain valid. Not a general ISO
 * timestamp validator.
 */
export function isInvalidAuthenticationEvidenceWindow(
  evidence: InboundAuthenticationEvidence,
): boolean {
  return compareInstants(evidence.validFrom, evidence.expiresAt) > 0;
}

export function principalMatchesEvidence(
  principalId: string,
  evidence: InboundAuthenticationEvidence,
): boolean {
  return principalId === evidence.subjectId;
}


export function isInboundOperationAllowed(
  operation: InboundAccessRequest["operation"],
  policy: InboundAccessPolicy,
): boolean {
  return policy.allowedOperations.includes(operation);
}

/**
 * Generalized instant comparison, reused by every receipt-time validation
 * (pre-port evidence and post-port protection results alike).
 */
export function isInstantAfter(instant: string, evaluatedAt: string): boolean {
  return compareInstants(instant, evaluatedAt) > 0;
}

/**
 * Rejects a replay `receivedAt` that isn't itself a well-formed instant.
 * Unlike `compareInstants` (used by `isReplayReceiptTimeAfterEvaluation`),
 * which falls back to a lexicographic comparison for unparseable strings,
 * this never lets a malformed value reach that temporal comparison.
 */
export function isInvalidReplayReceivedAt(
  replayEvidence: InboundReplayEvidence,
): boolean {
  return Number.isNaN(Date.parse(replayEvidence.receivedAt));
}

/**
 * Rejects an evaluationTime (`evaluatedAt`) that isn't itself a well-formed
 * instant. Unlike `compareInstants`, which falls back to a lexicographic
 * comparison for unparseable strings, this never lets a malformed value
 * reach any temporal comparison that consumes it — evidence validity window,
 * replay receipt time, or replay-protection port receipt time alike.
 */
export function isInvalidEvaluationTime(evaluatedAt: string): boolean {
  return Number.isNaN(Date.parse(evaluatedAt));
}

export function isReplayReceiptTimeAfterEvaluation(
  replayEvidence: InboundReplayEvidence,
  evaluatedAt: string,
): boolean {
  return isInstantAfter(replayEvidence.receivedAt, evaluatedAt);
}

/**
 * A present-but-blank nonce is neither an explicit absence (`null`) nor a
 * usable replay identifier. Validates only — never trims or normalizes the
 * original value before it reaches the replay-protection port.
 */
export function isInvalidPresentReplayNonce(
  replayEvidence: InboundReplayEvidence,
): boolean {
  return (
    replayEvidence.nonce !== null && replayEvidence.nonce.trim().length === 0
  );
}

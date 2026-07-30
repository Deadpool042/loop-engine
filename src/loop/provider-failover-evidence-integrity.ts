import { createHash } from "node:crypto";

import type {
  LoopProviderFailoverAttemptEvidence,
  LoopProviderFailoverEvidence,
} from "./provider-failover.js";

export const LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM =
  "sha256" as const;

export type LoopProviderFailoverEvidenceFingerprint = Readonly<{
  algorithm: typeof LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM;
  digest: string;
}>;

function canonicalAttempt(attempt: LoopProviderFailoverAttemptEvidence) {
  return {
    attempt: attempt.attempt,
    provider: attempt.provider,
    runtime: attempt.runtime,
    profileId: attempt.profileId,
    model: attempt.model,
    status: attempt.status,
    failureCode: attempt.failureCode,
    recoverable: attempt.recoverable,
  };
}

export function canonicalizeLoopProviderFailoverEvidence(
  evidence: LoopProviderFailoverEvidence,
): string {
  return JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    maxAttempts: evidence.maxAttempts,
    attemptedProviders: [...evidence.attemptedProviders],
    selectedProvider: evidence.selectedProvider,
    attempts: evidence.attempts.map(canonicalAttempt),
  });
}

export function fingerprintLoopProviderFailoverEvidence(
  evidence: LoopProviderFailoverEvidence,
): LoopProviderFailoverEvidenceFingerprint {
  return Object.freeze({
    algorithm: LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM,
    digest: createHash("sha256")
      .update(canonicalizeLoopProviderFailoverEvidence(evidence), "utf8")
      .digest("hex"),
  });
}

export function verifyLoopProviderFailoverEvidenceFingerprint(
  evidence: LoopProviderFailoverEvidence,
  fingerprint: LoopProviderFailoverEvidenceFingerprint,
): boolean {
  if (
    fingerprint.algorithm !==
      LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM ||
    !/^[a-f0-9]{64}$/.test(fingerprint.digest)
  ) {
    return false;
  }
  return fingerprintLoopProviderFailoverEvidence(evidence).digest === fingerprint.digest;
}

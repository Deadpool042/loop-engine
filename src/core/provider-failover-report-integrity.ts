import {
  LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM,
  verifyLoopProviderFailoverEvidenceFingerprint,
  type LoopProviderFailoverEvidenceFingerprint,
} from "../loop/provider-failover-evidence-integrity.js";
import type {
  LoopProviderFailoverAttemptEvidence,
  LoopProviderFailoverEvidence,
} from "../loop/provider-failover.js";

type UnknownRecord = Record<string, unknown>;

export type ProviderFailoverReportIntegrityFailureCode =
  | "provider_failover_evidence_pair_mismatch"
  | "invalid_provider_failover_evidence"
  | "invalid_provider_failover_fingerprint"
  | "provider_failover_fingerprint_mismatch"
  | "provider_failover_semantic_mismatch";

export type ProviderFailoverReportIntegrityResult =
  | Readonly<{
      status: "accepted";
      evidence: LoopProviderFailoverEvidence | null;
      fingerprint: LoopProviderFailoverEvidenceFingerprint | null;
    }>
  | Readonly<{
      status: "rejected";
      code: ProviderFailoverReportIntegrityFailureCode;
      details: readonly string[];
    }>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAttempt(value: unknown): value is LoopProviderFailoverAttemptEvidence {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.attempt) &&
    typeof value.attempt === "number" &&
    value.attempt > 0 &&
    isNonEmptyString(value.provider) &&
    isNonEmptyString(value.runtime) &&
    isNonEmptyString(value.profileId) &&
    isNonEmptyString(value.model) &&
    (value.status === "completed" || value.status === "failed") &&
    (value.failureCode === null || isNonEmptyString(value.failureCode)) &&
    typeof value.recoverable === "boolean"
  );
}

function isEvidence(value: unknown): value is LoopProviderFailoverEvidence {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    Number.isInteger(value.maxAttempts) &&
    typeof value.maxAttempts === "number" &&
    value.maxAttempts > 0 &&
    Array.isArray(value.attemptedProviders) &&
    value.attemptedProviders.every(isNonEmptyString) &&
    (value.selectedProvider === null || isNonEmptyString(value.selectedProvider)) &&
    Array.isArray(value.attempts) &&
    value.attempts.every(isAttempt)
  );
}

function isFingerprint(
  value: unknown,
): value is LoopProviderFailoverEvidenceFingerprint {
  return (
    isRecord(value) &&
    value.algorithm === LOOP_PROVIDER_FAILOVER_EVIDENCE_FINGERPRINT_ALGORITHM &&
    typeof value.digest === "string" &&
    /^[a-f0-9]{64}$/.test(value.digest)
  );
}

function semanticError(evidence: LoopProviderFailoverEvidence): string | null {
  if (evidence.attempts.length > evidence.maxAttempts) {
    return "Provider attempts exceed the declared global attempt bound.";
  }
  if (evidence.attemptedProviders.length !== evidence.attempts.length) {
    return "attemptedProviders must contain exactly one entry per attempt.";
  }
  const providers = evidence.attempts.map((attempt) => attempt.provider);
  if (new Set(providers).size !== providers.length) {
    return "A provider may appear at most once in failover evidence.";
  }
  if (providers.some((provider, index) => evidence.attemptedProviders[index] !== provider)) {
    return "attemptedProviders must preserve the exact attempt order.";
  }
  for (const [index, attempt] of evidence.attempts.entries()) {
    if (attempt.attempt !== index + 1) {
      return "Provider attempt numbers must be contiguous and one-based.";
    }
    if (attempt.status === "completed") {
      if (attempt.failureCode !== null || attempt.recoverable) {
        return "A completed provider attempt cannot carry failure or recovery state.";
      }
      if (index !== evidence.attempts.length - 1) {
        return "No provider attempt may follow a completed attempt.";
      }
    } else if (attempt.failureCode === null) {
      return "A failed provider attempt requires a stable failure code.";
    }
    if (index < evidence.attempts.length - 1 && !attempt.recoverable) {
      return "Only a recoverable failed attempt may admit another provider.";
    }
  }
  const completed = evidence.attempts.filter((attempt) => attempt.status === "completed");
  if (completed.length > 1) return "Failover evidence may contain at most one completion.";
  const selected = completed[0]?.provider ?? null;
  if (evidence.selectedProvider !== selected) {
    return "selectedProvider must identify the completed provider or be null.";
  }
  return null;
}

function rejected(
  code: ProviderFailoverReportIntegrityFailureCode,
  detail: string,
): ProviderFailoverReportIntegrityResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    details: Object.freeze([detail]),
  });
}

export function verifyProviderFailoverReportIntegrity(
  evidenceValue: unknown,
  fingerprintValue: unknown,
): ProviderFailoverReportIntegrityResult {
  const evidenceAbsent = evidenceValue === null || evidenceValue === undefined;
  const fingerprintAbsent = fingerprintValue === null || fingerprintValue === undefined;
  if (evidenceAbsent !== fingerprintAbsent) {
    return rejected(
      "provider_failover_evidence_pair_mismatch",
      "Provider failover evidence and fingerprint must be both present or both absent.",
    );
  }
  if (evidenceAbsent) {
    return Object.freeze({ status: "accepted" as const, evidence: null, fingerprint: null });
  }
  if (!isEvidence(evidenceValue)) {
    return rejected(
      "invalid_provider_failover_evidence",
      "Provider failover evidence does not match schema version 1.",
    );
  }
  const semanticFailure = semanticError(evidenceValue);
  if (semanticFailure) {
    return rejected("provider_failover_semantic_mismatch", semanticFailure);
  }
  if (!isFingerprint(fingerprintValue)) {
    return rejected(
      "invalid_provider_failover_fingerprint",
      "Provider failover fingerprint must be a SHA-256 hex digest.",
    );
  }
  if (!verifyLoopProviderFailoverEvidenceFingerprint(evidenceValue, fingerprintValue)) {
    return rejected(
      "provider_failover_fingerprint_mismatch",
      "Provider failover evidence does not match its declared fingerprint.",
    );
  }
  return Object.freeze({
    status: "accepted" as const,
    evidence: evidenceValue,
    fingerprint: fingerprintValue,
  });
}

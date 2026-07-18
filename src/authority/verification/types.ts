import type { ExecutionAuthority } from "../../dispatch/types.js";
import type { OperatorApprovalResult } from "../rfc/types.js";

export type AuthorityVerificationId = string;
export type AuthorityVerificationMetadata = Readonly<Record<string, unknown>>;

export const AUTHORITY_VERIFICATION_STATES = ["pending", "verified", "not_verified", "expired", "revoked", "superseded", "unsupported", "invalid"] as const;
export type AuthorityVerificationState = (typeof AUTHORITY_VERIFICATION_STATES)[number];
export const AUTHORITY_VERIFICATION_OUTCOMES = ["pass", "fail", "unknown"] as const;
export type AuthorityVerificationOutcome = (typeof AUTHORITY_VERIFICATION_OUTCOMES)[number];

export type AuthorityVerificationSubject = Readonly<{
  authorityId: string;
  authorityVersion: string;
  approvalId: string;
  approvalVersion: string;
  approvalScope: string;
  providerId: string;
  protocolId: string;
  mappingId: string;
  intentId: string;
  runtimeCapabilityId: string;
  transportCapabilityId: string;
  policyId: string;
  evidenceIds: readonly string[];
}>;

export type AuthorityVerificationContext = Readonly<{
  verificationAt: string;
  supported: boolean;
  subject: AuthorityVerificationSubject;
  validFrom?: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  superseded?: boolean;
  metadata?: AuthorityVerificationMetadata;
}>;

export type AuthorityVerificationRequirement = Readonly<{
  id: string;
  outcome: AuthorityVerificationOutcome;
  reason: string;
  executionStarted: false;
}>;
export type AuthorityVerificationCheck = AuthorityVerificationRequirement;
export type AuthorityVerificationEvidence = Readonly<{
  id: string;
  type: string;
  sourceId: string;
  referenceId: string;
  subjectId: string;
  issuerId: string;
  issuedAt: string;
  reviewedAt: string;
  expiresAt?: string;
  notes: readonly string[];
}>;

export type AuthorityVerificationRFC = Readonly<{
  id: AuthorityVerificationId;
  state: AuthorityVerificationState;
  subject: AuthorityVerificationSubject;
  context: AuthorityVerificationContext;
  checks: readonly AuthorityVerificationCheck[];
  evidence: readonly AuthorityVerificationEvidence[];
  metadata: AuthorityVerificationMetadata;
  executionAllowed: false;
  executionStarted: false;
}>;

export const AUTHORITY_VERIFICATION_ERROR_CODES = [
  "verification_input_missing", "verification_context_invalid", "authority_missing", "authority_invalid", "authority_inactive", "authority_unapproved",
  "approval_missing", "approval_invalid", "approval_not_approved", "approval_review_incomplete", "approval_scope_mismatch", "authority_version_mismatch", "approval_version_mismatch",
  "provider_mismatch", "protocol_mismatch", "mapping_mismatch", "intent_mismatch", "runtime_capability_mismatch", "transport_capability_mismatch", "policy_mismatch",
  "evidence_missing", "evidence_invalid", "not_yet_valid", "expired", "revoked", "superseded", "verification_unsupported",
] as const;
export type AuthorityVerificationErrorCode = (typeof AUTHORITY_VERIFICATION_ERROR_CODES)[number];
export type AuthorityVerificationError = Readonly<{
  code: AuthorityVerificationErrorCode;
  message: string;
  details: AuthorityVerificationMetadata;
  executionAllowed: false;
  executionStarted: false;
}>;
export type AuthorityVerificationValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly AuthorityVerificationError[];
}>;
export type AuthorityVerificationEvaluation = Readonly<{
  verified: boolean;
  authorityVerified: boolean;
  approvalVerified: boolean;
  scopeVerified: boolean;
  versionVerified: boolean;
  policyVerified: boolean;
  evidenceVerified: boolean;
  reviewVerified: boolean;
  validityVerified: boolean;
  revocationVerified: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;
export type AuthorityVerificationSummary = Readonly<{
  state: AuthorityVerificationState;
  checkCount: number;
  passedChecks: number;
  failedChecks: number;
  verified: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;
export type AuthorityVerificationResult = Readonly<{
  state: AuthorityVerificationState;
  verification: AuthorityVerificationRFC;
  evaluation: AuthorityVerificationEvaluation;
  validation: AuthorityVerificationValidation;
  summary: AuthorityVerificationSummary;
  diagnostics: readonly AuthorityVerificationError[];
  verified: boolean;
  authorityVerified: boolean;
  approvalVerified: boolean;
  scopeVerified: boolean;
  versionVerified: boolean;
  policyVerified: boolean;
  evidenceVerified: boolean;
  reviewVerified: boolean;
  validityVerified: boolean;
  revocationVerified: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;
export type AuthorityVerificationBuilder = (
  authority: ExecutionAuthority | null,
  approval: OperatorApprovalResult | null,
  context: AuthorityVerificationContext,
) => AuthorityVerificationResult;

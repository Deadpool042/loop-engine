// OperatorApprovalRFC (V13.1) records human approval evidence for an existing
// declarative ExecutionAuthority. It remains a closed, non-operational model.

import type { ExecutionAuthority } from "../../dispatch/types.js";

export type OperatorApprovalId = string;
export type OperatorApprovalMetadata = Readonly<Record<string, unknown>>;

export const OPERATOR_APPROVAL_STATES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "revoked",
  "superseded",
] as const;

export type OperatorApprovalState =
  (typeof OPERATOR_APPROVAL_STATES)[number];

export const OPERATOR_APPROVAL_REQUIREMENT_OUTCOMES = [
  "pass",
  "fail",
  "unknown",
] as const;

export type OperatorApprovalRequirementOutcome =
  (typeof OPERATOR_APPROVAL_REQUIREMENT_OUTCOMES)[number];

export type OperatorApprovalRequirement = Readonly<{
  id: string;
  outcome: OperatorApprovalRequirementOutcome;
  reason: string;
  executionStarted: false;
}>;

export type OperatorApprovalEvidence = Readonly<{
  authorityId: ExecutionAuthority["id"];
  eligibilityId: ExecutionAuthority["eligibilityId"];
  reviewedRequestId: ExecutionAuthority["reviewedRequestId"];
  reviewId: ExecutionAuthority["reviewId"];
  provenanceId: ExecutionAuthority["provenanceId"];
  policyVersion: ExecutionAuthority["policyVersion"];
  configurationVersion: ExecutionAuthority["configurationVersion"];
  approvalVersion: string;
  references: readonly string[];
  executionStarted: false;
}>;

export type OperatorApprovalReview = Readonly<{
  state: OperatorApprovalState;
  previousState?: OperatorApprovalState;
  reviewerId: string;
  reviewedAt: string;
  approvalScope: string;
  approvalVersion: string;
  evidenceReferences: readonly string[];
  expiryPolicy: string;
  approved: boolean;
  expired: boolean;
  revoked: boolean;
  revocationReason?: string;
  metadata?: OperatorApprovalMetadata;
}>;

export type OperatorApprovalRFC = Readonly<{
  id: OperatorApprovalId;
  state: OperatorApprovalState;
  authorityId: ExecutionAuthority["id"];
  evidence: OperatorApprovalEvidence;
  review: OperatorApprovalReview;
  requirements: readonly OperatorApprovalRequirement[];
  metadata: OperatorApprovalMetadata;
  approved: boolean;
  revoked: boolean;
  expired: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;

export const OPERATOR_APPROVAL_ERROR_CODES = [
  "operator_approval_missing",
  "operator_approval_authority_missing",
  "operator_approval_state_invalid",
  "operator_approval_transition_invalid",
  "operator_approval_evidence_missing",
  "operator_approval_scope_missing",
  "operator_approval_version_missing",
  "operator_approval_review_incomplete",
  "operator_approval_expired",
  "operator_approval_revoked",
  "operator_approval_validation_failed",
] as const;

export type OperatorApprovalErrorCode =
  (typeof OPERATOR_APPROVAL_ERROR_CODES)[number];

export type OperatorApprovalError = Readonly<{
  code: OperatorApprovalErrorCode;
  message: string;
  details: OperatorApprovalMetadata;
  executionStarted: false;
}>;

export type OperatorApprovalDiagnostic = Readonly<{
  code: OperatorApprovalErrorCode;
  message: string;
  details: OperatorApprovalMetadata;
}>;

export type OperatorApprovalValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly OperatorApprovalDiagnostic[];
  error?: OperatorApprovalError;
}>;

export type OperatorApprovalEvaluation = Readonly<{
  state: OperatorApprovalState;
  requirements: readonly OperatorApprovalRequirement[];
  validation: OperatorApprovalValidation;
  approved: boolean;
  revoked: boolean;
  expired: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;

export type OperatorApprovalSummary = Readonly<{
  state: OperatorApprovalState;
  authorityReferenced: boolean;
  reviewComplete: boolean;
  evidenceComplete: boolean;
  scopePresent: boolean;
  versionPresent: boolean;
  transitionValid: boolean;
  approved: boolean;
  revoked: boolean;
  expired: boolean;
  executionAllowed: false;
}>;

export type OperatorApprovalResult = Readonly<{
  state: OperatorApprovalState;
  approval: OperatorApprovalRFC;
  evaluation: OperatorApprovalEvaluation;
  summary: OperatorApprovalSummary;
  validation: OperatorApprovalValidation;
  diagnostics: readonly OperatorApprovalDiagnostic[];
  metadata: OperatorApprovalMetadata;
  error?: OperatorApprovalError;
  approved: boolean;
  revoked: boolean;
  expired: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;

export type OperatorApprovalBuilder = (
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
) => OperatorApprovalResult;

// ApprovalProvenance (V11.4) records descriptive review evidence only. It is
// not authorization and cannot cross the execution boundary.

import type {
  AuthorizationConfigurationId,
  AuthorizationConfigurationMetadata,
} from "../authorization/types.js";
import type {
  ExecutionReviewId,
  ReviewedTransportRequest,
} from "../review/types.js";

export type ApprovalProvenanceId = string;
export type ApprovalProvenanceMetadata = AuthorizationConfigurationMetadata;

export const APPROVAL_PROVENANCE_STATUSES = [
  "reviewPending",
  "notApproved",
  "invalid",
] as const;

export type ApprovalProvenanceStatus =
  (typeof APPROVAL_PROVENANCE_STATUSES)[number];

export type ApprovalEvidence = Readonly<{
  approvalId: string;
  abstractApproverId: string;
  reviewedBy: "abstract_approval_identifier";
  approved: false;
}>;

export type ApprovalScope = Readonly<{
  reviewId: ExecutionReviewId;
  configurationId: AuthorizationConfigurationId;
  reviewedRequestId: ReviewedTransportRequest["id"];
  reviewedStatus: ReviewedTransportRequest["status"];
}>;

export type ApprovalVersionSet = Readonly<{
  policyVersion: string;
  configurationVersion: string;
  mappingVersion: string;
  protocolVersion: string;
  runtimeContractVersion: string;
  transportContractVersion: string;
  architectureRfcVersion: "rfc-execution-architecture-v11";
}>;

export type ApprovalProvenance = Readonly<{
  id: ApprovalProvenanceId;
  status: ApprovalProvenanceStatus;
  reviewIdentifier: ExecutionReviewId;
  reviewTimestamp: string;
  scope: ApprovalScope;
  evidence: ApprovalEvidence;
  versions: ApprovalVersionSet;
  metadata: ApprovalProvenanceMetadata;
  approved: false;
  executionStarted: false;
}>;

export type ApprovalSummary = Readonly<{
  reviewReferenced: boolean;
  configurationConsistent: boolean;
  policyVersionConsistent: boolean;
  rfcVersionConsistent: boolean;
  referencesIntact: boolean;
  reviewPending: true;
  notApproved: true;
  evidenceOnly: true;
  immutable: boolean;
}>;

export const APPROVAL_ERROR_CODES = [
  "approval_missing",
  "approval_pending",
  "approval_invalid",
  "approval_version_mismatch",
  "approval_reference_mismatch",
  "approval_validation_failed",
] as const;

export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[number];

export type ApprovalError = Readonly<{
  code: ApprovalErrorCode;
  message: string;
  details: ApprovalProvenanceMetadata;
  executionStarted: false;
}>;

export type ApprovalDiagnostic = Readonly<{
  code: ApprovalErrorCode;
  message: string;
  details: ApprovalProvenanceMetadata;
}>;

export type ApprovalValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly ApprovalDiagnostic[];
  error?: ApprovalError;
}>;

export type ApprovalResult = Readonly<{
  status: ApprovalProvenanceStatus;
  provenance: ApprovalProvenance;
  summary: ApprovalSummary;
  validation: ApprovalValidation;
  diagnostics: readonly ApprovalDiagnostic[];
  metadata: ApprovalProvenanceMetadata;
  error?: ApprovalError;
  executionStarted: false;
}>;

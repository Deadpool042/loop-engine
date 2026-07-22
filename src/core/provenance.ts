import type { AuthorizationConfiguration } from "../authorization/types.js";
import {
  createApprovalProvenance as createApprovalProvenanceWithContracts,
  normalizeApprovalProvenance as normalizeApprovalProvenanceWithContracts,
  summarizeApprovalProvenance as summarizeApprovalProvenanceWithContracts,
  validateApprovalProvenance as validateApprovalProvenanceWithContracts,
  type ApprovalProvenance,
  type ApprovalResult,
  type ApprovalSummary,
  type ApprovalValidation,
} from "../provenance/index.js";
import type { ReviewedTransportRequest } from "../review/types.js";

export function createApprovalProvenance(
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalResult {
  return createApprovalProvenanceWithContracts(reviewed, authorization);
}

export function validateApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalValidation {
  return validateApprovalProvenanceWithContracts(
    provenance,
    reviewed,
    authorization,
  );
}

export function summarizeApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalSummary {
  return summarizeApprovalProvenanceWithContracts(
    provenance,
    reviewed,
    authorization,
  );
}

export function normalizeApprovalProvenance(
  result: ApprovalResult,
): ApprovalResult {
  return normalizeApprovalProvenanceWithContracts(result);
}

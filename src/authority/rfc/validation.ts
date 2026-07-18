import type { ExecutionAuthority } from "../../dispatch/types.js";
import { createOperatorApprovalError, createOperatorApprovalValidation } from "./errors.js";
import { hasValidTransition, stateConsistent } from "./support.js";
import type { OperatorApprovalRFC, OperatorApprovalReview, OperatorApprovalValidation } from "./types.js";

function invalid(code: Parameters<typeof createOperatorApprovalError>[0], message: string): OperatorApprovalValidation {
  return createOperatorApprovalValidation(createOperatorApprovalError(code, message));
}

export function validateOperatorApprovalInput(
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
): OperatorApprovalValidation {
  if (!review) return invalid("operator_approval_missing", "Operator approval review is required.");
  if (!authority) return invalid("operator_approval_authority_missing", "Operator approval requires an ExecutionAuthority reference.");
  if (!review.reviewerId || !review.reviewedAt || !review.expiryPolicy) return invalid("operator_approval_review_incomplete", "Operator approval review is incomplete.");
  if (!review.approvalScope) return invalid("operator_approval_scope_missing", "Operator approval scope is required.");
  if (!review.approvalVersion) return invalid("operator_approval_version_missing", "Operator approval version is required.");
  if (review.evidenceReferences.length === 0) return invalid("operator_approval_evidence_missing", "Operator approval evidence is required.");
  if (!hasValidTransition(review)) return invalid("operator_approval_transition_invalid", "Operator approval transition is invalid.");
  if (review.revoked && !review.revocationReason) return invalid("operator_approval_review_incomplete", "Operator approval revocation reason is required.");
  if (!stateConsistent(review)) return invalid("operator_approval_state_invalid", "Operator approval state is inconsistent.");
  if (review.expired) return invalid("operator_approval_expired", "Operator approval is expired.");
  if (review.revoked) return invalid("operator_approval_revoked", "Operator approval is revoked.");
  return createOperatorApprovalValidation();
}

export function validateOperatorApprovalRFC(
  approval: OperatorApprovalRFC | null,
): OperatorApprovalValidation {
  if (!approval) return invalid("operator_approval_missing", "OperatorApprovalRFC is missing.");
  if (!approval.id || !approval.authorityId) return invalid("operator_approval_authority_missing", "OperatorApprovalRFC authority evidence is missing.");
  if (approval.executionAllowed) return invalid("operator_approval_validation_failed", "OperatorApprovalRFC must not allow execution.");
  if (approval.requirements.some((item) => item.outcome !== "pass")) return invalid("operator_approval_validation_failed", "OperatorApprovalRFC requirements are incomplete.");
  return createOperatorApprovalValidation();
}

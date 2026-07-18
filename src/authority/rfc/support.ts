import type { ExecutionAuthority } from "../../dispatch/types.js";
import type {
  OperatorApprovalEvidence,
  OperatorApprovalMetadata,
  OperatorApprovalRequirement,
  OperatorApprovalRequirementOutcome,
  OperatorApprovalReview,
  OperatorApprovalRFC,
  OperatorApprovalState,
  OperatorApprovalSummary,
} from "./types.js";

export const OPERATOR_APPROVAL_RFC_VERSION = "operator-approval-rfc-v13.1" as const;

const ALLOWED_TRANSITIONS: Readonly<Record<OperatorApprovalState, readonly OperatorApprovalState[]>> = {
  draft: ["submitted"],
  submitted: ["under_review", "rejected", "superseded"],
  under_review: ["approved", "rejected", "expired", "superseded"],
  approved: ["expired", "revoked", "superseded"],
  rejected: ["superseded"],
  expired: ["superseded"],
  revoked: ["superseded"],
  superseded: [],
};

export function freezeOperatorApprovalValue<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => freezeOperatorApprovalValue(item));
    Object.freeze(value);
  } else if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      freezeOperatorApprovalValue(item),
    );
    Object.freeze(value);
  }
  return value;
}

export function operatorApprovalIdFor(
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
): string {
  return `operator-approval-rfc.${authority?.id ?? "missing"}.${review?.approvalVersion ?? "draft"}`;
}

export function hasValidTransition(review: OperatorApprovalReview): boolean {
  return !review.previousState || ALLOWED_TRANSITIONS[review.previousState].includes(review.state);
}

function emptyReview(): OperatorApprovalReview {
  return freezeOperatorApprovalValue({
    state: "draft",
    reviewerId: "",
    reviewedAt: "",
    approvalScope: "",
    approvalVersion: "",
    evidenceReferences: [],
    expiryPolicy: "",
    approved: false,
    expired: false,
    revoked: false,
    metadata: {},
  });
}

function emptyEvidence(): OperatorApprovalEvidence {
  return freezeOperatorApprovalValue({
    authorityId: "",
    eligibilityId: "",
    reviewedRequestId: "",
    reviewId: "",
    provenanceId: "",
    policyVersion: "",
    configurationVersion: "",
    approvalVersion: "",
    references: [],
    executionStarted: false,
  });
}

export function evidenceFor(
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
): OperatorApprovalEvidence {
  if (!authority || !review) return emptyEvidence();
  return freezeOperatorApprovalValue({
    authorityId: authority.id,
    eligibilityId: authority.eligibilityId,
    reviewedRequestId: authority.reviewedRequestId,
    reviewId: authority.reviewId,
    provenanceId: authority.provenanceId,
    policyVersion: authority.policyVersion,
    configurationVersion: authority.configurationVersion,
    approvalVersion: review.approvalVersion,
    references: [...review.evidenceReferences].sort(),
    executionStarted: false,
  });
}

function outcome(value: boolean): OperatorApprovalRequirementOutcome {
  return value ? "pass" : "fail";
}

function requirement(
  id: string,
  value: boolean,
  reason: string,
): OperatorApprovalRequirement {
  return freezeOperatorApprovalValue({ id, outcome: outcome(value), reason, executionStarted: false });
}

export function requirementsFor(
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
): readonly OperatorApprovalRequirement[] {
  if (!review) {
    return freezeOperatorApprovalValue([
      freezeOperatorApprovalValue({
        id: "review_present",
        outcome: "unknown" as const,
        reason: "Operator approval review is missing.",
        executionStarted: false,
      }),
    ]);
  }
  return freezeOperatorApprovalValue([
    requirement("authority_present", Boolean(authority?.id), "ExecutionAuthority must be referenced."),
    requirement("reviewer_present", review.reviewerId.length > 0, "Reviewer identity must be explicit."),
    requirement("review_timestamp_present", review.reviewedAt.length > 0, "Review timestamp must be explicit."),
    requirement("scope_present", review.approvalScope.length > 0, "Approval scope must be explicit."),
    requirement("version_present", review.approvalVersion.length > 0, "Approval version must be explicit."),
    requirement("evidence_present", review.evidenceReferences.length > 0, "Evidence references must be explicit."),
    requirement("expiry_policy_present", review.expiryPolicy.length > 0, "Expiry policy must be explicit."),
    requirement("transition_valid", hasValidTransition(review), "Lifecycle transition must be explicit and valid."),
    requirement("revocation_traceable", !review.revoked || Boolean(review.revocationReason), "Revocation requires a reason."),
    requirement("state_consistent", stateConsistent(review), "State and approval flags must agree."),
  ]);
}

export function stateConsistent(review: OperatorApprovalReview): boolean {
  if (review.state === "approved") return review.approved && !review.revoked && !review.expired;
  if (review.state === "expired") return review.expired && !review.approved;
  if (review.state === "revoked") return review.revoked && !review.approved;
  return !review.approved && !review.revoked && !review.expired;
}

export function metadataFor(review: OperatorApprovalReview | null): OperatorApprovalMetadata {
  return freezeOperatorApprovalValue({
    ...(review?.metadata ?? {}),
    rfcVersion: OPERATOR_APPROVAL_RFC_VERSION,
    declarative: true,
  });
}

export function buildOperatorApprovalRFC(
  authority: ExecutionAuthority | null,
  review: OperatorApprovalReview | null,
): OperatorApprovalRFC {
  const normalizedReview = review
    ? freezeOperatorApprovalValue({ ...review, evidenceReferences: [...review.evidenceReferences].sort(), metadata: freezeOperatorApprovalValue({ ...(review.metadata ?? {}) }) })
    : emptyReview();
  return freezeOperatorApprovalValue({
    id: operatorApprovalIdFor(authority, review),
    state: normalizedReview.state,
    authorityId: authority?.id ?? "",
    evidence: evidenceFor(authority, review),
    review: normalizedReview,
    requirements: requirementsFor(authority, review),
    metadata: metadataFor(review),
    approved: normalizedReview.approved,
    revoked: normalizedReview.revoked,
    expired: normalizedReview.expired,
    executionAllowed: false,
    executionStarted: false,
  });
}

export function summarizeOperatorApprovalRFC(
  approval: OperatorApprovalRFC,
): OperatorApprovalSummary {
  const requirement = (id: string) => approval.requirements.find((item) => item.id === id)?.outcome === "pass";
  return freezeOperatorApprovalValue({
    state: approval.state,
    authorityReferenced: requirement("authority_present"),
    reviewComplete: ["reviewer_present", "review_timestamp_present", "evidence_present", "expiry_policy_present"].every(requirement),
    evidenceComplete: approval.evidence.references.length > 0,
    scopePresent: requirement("scope_present"),
    versionPresent: requirement("version_present"),
    transitionValid: requirement("transition_valid"),
    approved: approval.approved,
    revoked: approval.revoked,
    expired: approval.expired,
    executionAllowed: false,
  });
}

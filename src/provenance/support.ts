import type { AuthorizationConfiguration } from "../authorization/types.js";
import {
  freezeReviewArchitectureValue,
  readReviewArchitectureMetadataString,
} from "../review-architecture/shared.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import type {
  ApprovalProvenance,
  ApprovalProvenanceMetadata,
  ApprovalSummary,
  ApprovalVersionSet,
} from "./types.js";

export const EXECUTION_ARCHITECTURE_RFC_VERSION =
  "rfc-execution-architecture-v11" as const;

export const OpenClawApprovalProvenanceFixture: ApprovalProvenance =
  freezeApprovalValue({
    id: "approval-provenance.execution-review.transport-request.openclaw.plan",
    status: "reviewPending",
    reviewIdentifier: "execution-review.transport-request.openclaw.plan",
    reviewTimestamp: "review-pending",
    scope: {
      reviewId: "execution-review.transport-request.openclaw.plan",
      configurationId: "openclaw-plan-review",
      reviewedRequestId: "transport-request.openclaw.plan",
      reviewedStatus: "handoff_denied",
    },
    evidence: {
      approvalId:
        "approval.execution-review.transport-request.openclaw.plan.pending",
      abstractApproverId: "approval-identifier.pending",
      reviewedBy: "abstract_approval_identifier",
      approved: false,
    },
    versions: {
      policyVersion: "default-deny/v1",
      configurationVersion: "openclaw-plan-review/v1",
      mappingVersion: "loop-engine-openclaw-planning/v1",
      protocolVersion: "loop-engine-openclaw-planning/v1",
      runtimeContractVersion: "openclaw/v1",
      transportContractVersion: "local-process/v1",
      architectureRfcVersion: EXECUTION_ARCHITECTURE_RFC_VERSION,
    },
    metadata: { fixture: "openclaw-approval-provenance" },
    approved: false,
    executionStarted: false,
  });

export function freezeApprovalValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

function metadataString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  return readReviewArchitectureMetadataString(metadata, key);
}

export function configurationVersionFor(
  authorization: AuthorizationConfiguration,
): string {
  return (
    metadataString(authorization.reviewMetadata, "configurationVersion") ??
    `${authorization.id}/v1`
  );
}

export function approvalProvenanceIdFor(
  reviewed: ReviewedTransportRequest,
): string {
  return `approval-provenance.${reviewed.reviewId}`;
}

export function approvalVersionSetFor(
  authorization: AuthorizationConfiguration,
): ApprovalVersionSet {
  return freezeApprovalValue({
    policyVersion: authorization.requirement.policyVersion,
    configurationVersion: configurationVersionFor(authorization),
    mappingVersion: authorization.requirement.mappingVersion,
    protocolVersion: authorization.requirement.protocolVersion,
    runtimeContractVersion: authorization.requirement.runtimeVersion,
    transportContractVersion: authorization.requirement.transportVersion,
    architectureRfcVersion: EXECUTION_ARCHITECTURE_RFC_VERSION,
  });
}

export function normalizeApprovalMetadata(
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalProvenanceMetadata {
  return freezeApprovalValue({
    ...reviewed.metadata,
    configurationId: authorization.id,
    approvalState: "reviewPending",
    architectureRfcVersion: EXECUTION_ARCHITECTURE_RFC_VERSION,
  });
}

export function buildApprovalProvenance(
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalProvenance {
  const metadata = normalizeApprovalMetadata(reviewed, authorization);
  return freezeApprovalValue({
    id: approvalProvenanceIdFor(reviewed),
    status: "reviewPending",
    reviewIdentifier: reviewed.reviewId,
    reviewTimestamp:
      metadataString(reviewed.metadata, "reviewTimestamp") ?? "review-pending",
    scope: {
      reviewId: reviewed.reviewId,
      configurationId: authorization.id,
      reviewedRequestId: reviewed.id,
      reviewedStatus: reviewed.status,
    },
    evidence: {
      approvalId: `approval.${reviewed.reviewId}.pending`,
      abstractApproverId:
        metadataString(reviewed.metadata, "abstractApproverId") ??
        "approval-identifier.pending",
      reviewedBy: "abstract_approval_identifier",
      approved: false,
    },
    versions: approvalVersionSetFor(authorization),
    metadata,
    approved: false,
    executionStarted: false,
  });
}

export function summarizeApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalSummary {
  return freezeApprovalValue({
    reviewReferenced:
      provenance.reviewIdentifier.length > 0 &&
      provenance.reviewIdentifier === reviewed.reviewId,
    configurationConsistent:
      provenance.scope.configurationId === authorization.id &&
      reviewed.configurationId === authorization.id,
    policyVersionConsistent:
      provenance.versions.policyVersion ===
      authorization.requirement.policyVersion,
    rfcVersionConsistent:
      provenance.versions.architectureRfcVersion ===
      EXECUTION_ARCHITECTURE_RFC_VERSION,
    referencesIntact:
      provenance.scope.reviewId === reviewed.reviewId &&
      provenance.scope.reviewedRequestId === reviewed.id &&
      provenance.scope.reviewedStatus === reviewed.status,
    reviewPending: true,
    notApproved: true,
    evidenceOnly: true,
    immutable: Object.isFrozen(provenance),
  });
}

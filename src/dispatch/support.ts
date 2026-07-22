import type { HandoffEligibilityResult } from "../handoff-eligibility/types.js";
import { freezeReviewArchitectureValue } from "../review-architecture/shared.js";
import type {
  DispatchDescriptor,
  DispatchDescriptorEvidence,
  DispatchDescriptorMetadata,
  DispatchDescriptorStatus,
  DispatchDescriptorSummary,
  ExecutionAuthority,
} from "./types.js";

export const EXECUTION_BOUNDARY_RFC_VERSION =
  "rfc-execution-boundary-v12" as const;

export const OpenClawExecutionAuthorityFixture: ExecutionAuthority =
  freezeDispatchValue({
    id: "execution-authority.handoff-eligibility.execution-review.transport-request.openclaw.plan",
    status: "pending",
    eligibilityId:
      "handoff-eligibility.execution-review.transport-request.openclaw.plan",
    reviewedRequestId: "transport-request.openclaw.plan",
    reviewId: "execution-review.transport-request.openclaw.plan",
    provenanceId:
      "approval-provenance.execution-review.transport-request.openclaw.plan",
    policyVersion: "default-deny/v1",
    configurationVersion: "openclaw-plan-review/v1",
    mappingVersion: "loop-engine-openclaw-planning/v1",
    protocolVersion: "loop-engine-openclaw-planning/v1",
    runtimeContractVersion: "openclaw/v1",
    transportContractVersion: "local-process/v1",
    architectureRfcVersion: EXECUTION_BOUNDARY_RFC_VERSION,
    metadata: { fixture: "openclaw-execution-authority" },
    approved: false,
    revoked: false,
    expired: false,
    executionStarted: false,
  });

export const OpenClawDispatchDescriptorFixture: DispatchDescriptor =
  freezeDispatchValue({
    id: "dispatch-descriptor.handoff-eligibility.execution-review.transport-request.openclaw.plan",
    status: "pending",
    evidence: {
      eligibilityId:
        "handoff-eligibility.execution-review.transport-request.openclaw.plan",
      eligibilityDecision: "not_eligible",
      authorityId:
        "execution-authority.handoff-eligibility.execution-review.transport-request.openclaw.plan",
      authorityStatus: "pending",
      reviewedRequestId: "transport-request.openclaw.plan",
      reviewId: "execution-review.transport-request.openclaw.plan",
      provenanceId:
        "approval-provenance.execution-review.transport-request.openclaw.plan",
      policyVersion: "default-deny/v1",
      configurationVersion: "openclaw-plan-review/v1",
      mappingVersion: "loop-engine-openclaw-planning/v1",
      protocolVersion: "loop-engine-openclaw-planning/v1",
      runtimeContractVersion: "openclaw/v1",
      transportContractVersion: "local-process/v1",
      architectureRfcVersion: EXECUTION_BOUNDARY_RFC_VERSION,
      executionStarted: false,
    },
    metadata: { fixture: "openclaw-dispatch-descriptor" },
    readyForBoundary: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });

export function freezeDispatchValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

export function dispatchDescriptorIdFor(
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
): string {
  const sourceId =
    eligibility?.eligibility.id ?? authority?.eligibilityId ?? "missing";
  return `dispatch-descriptor.${sourceId}`;
}

function emptyEvidence(): DispatchDescriptorEvidence {
  return freezeDispatchValue({
    eligibilityId: "",
    eligibilityDecision: "not_eligible",
    authorityId: "",
    authorityStatus: "pending",
    reviewedRequestId: "",
    reviewId: "",
    provenanceId: "",
    policyVersion: "",
    configurationVersion: "",
    mappingVersion: "",
    protocolVersion: "",
    runtimeContractVersion: "",
    transportContractVersion: "",
    architectureRfcVersion: EXECUTION_BOUNDARY_RFC_VERSION,
    executionStarted: false,
  });
}

export function evidenceFor(
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
): DispatchDescriptorEvidence {
  if (!eligibility || !authority) return emptyEvidence();
  const evidence = eligibility.eligibility.evidence;
  return freezeDispatchValue({
    eligibilityId: eligibility.eligibility.id,
    eligibilityDecision: eligibility.decision,
    authorityId: authority.id,
    authorityStatus: authority.status,
    reviewedRequestId: evidence.reviewedRequestId,
    reviewId: evidence.reviewId,
    provenanceId: evidence.provenanceId,
    policyVersion: authority.policyVersion,
    configurationVersion: authority.configurationVersion,
    mappingVersion: authority.mappingVersion,
    protocolVersion: authority.protocolVersion,
    runtimeContractVersion: authority.runtimeContractVersion,
    transportContractVersion: authority.transportContractVersion,
    architectureRfcVersion: authority.architectureRfcVersion,
    executionStarted: false,
  });
}

export function normalizeDispatchDescriptorMetadata(
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
): DispatchDescriptorMetadata {
  return freezeDispatchValue({
    ...(eligibility?.metadata ?? {}),
    ...(authority?.metadata ?? {}),
  });
}

export function buildDispatchDescriptor(
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
  status: DispatchDescriptorStatus = "validated",
): DispatchDescriptor {
  return freezeDispatchValue({
    id: dispatchDescriptorIdFor(eligibility, authority),
    status,
    evidence: evidenceFor(eligibility, authority),
    metadata: normalizeDispatchDescriptorMetadata(eligibility, authority),
    readyForBoundary: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}

export function summarizeDispatchDescriptor(
  descriptor: DispatchDescriptor,
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
): DispatchDescriptorSummary {
  const eligibilityEvidence = eligibility?.eligibility.evidence;
  return freezeDispatchValue({
    eligibilityReferenced: descriptor.evidence.eligibilityId.length > 0,
    authorityReferenced: descriptor.evidence.authorityId.length > 0,
    eligibilityConsistent:
      eligibility !== null &&
      eligibility.validation.valid &&
      eligibility.decision === "eligible",
    authorityConsistent:
      authority !== null &&
      authority.status === "granted" &&
      authority.approved &&
      !authority.revoked &&
      !authority.expired,
    referencesConsistent:
      eligibilityEvidence !== undefined &&
      authority !== null &&
      authority.eligibilityId === descriptor.evidence.eligibilityId &&
      authority.reviewedRequestId === eligibilityEvidence.reviewedRequestId &&
      authority.reviewId === eligibilityEvidence.reviewId &&
      authority.provenanceId === eligibilityEvidence.provenanceId,
    versionsConsistent:
      eligibilityEvidence !== undefined &&
      authority !== null &&
      authority.policyVersion === eligibilityEvidence.policyVersion &&
      authority.configurationVersion ===
        eligibilityEvidence.configurationVersion &&
      authority.mappingVersion === eligibilityEvidence.mappingVersion &&
      authority.protocolVersion === eligibilityEvidence.protocolVersion &&
      authority.runtimeContractVersion ===
        eligibilityEvidence.runtimeContractVersion &&
      authority.transportContractVersion ===
        eligibilityEvidence.transportContractVersion &&
      authority.architectureRfcVersion === EXECUTION_BOUNDARY_RFC_VERSION,
    descriptorComplete:
      descriptor.id.length > 0 &&
      descriptor.evidence.eligibilityId.length > 0 &&
      descriptor.evidence.authorityId.length > 0,
    readyForBoundary: false,
    dispatchable: false,
    executable: false,
  });
}

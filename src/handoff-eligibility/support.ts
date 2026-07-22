import type { ApprovalProvenance } from "../provenance/types.js";
import { EXECUTION_ARCHITECTURE_RFC_VERSION } from "../provenance/support.js";
import {
  countReviewArchitectureItems,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import type {
  HandoffEligibility,
  HandoffEligibilityDecision,
  HandoffEligibilityEvidence,
  HandoffEligibilityMetadata,
  HandoffEligibilityReason,
  HandoffEligibilityRequirement,
  HandoffEligibilityRequirementId,
  HandoffEligibilityRequirementOutcome,
  HandoffEligibilityStatus,
  HandoffEligibilitySummary,
} from "./types.js";
import { HANDOFF_ELIGIBILITY_REQUIREMENT_IDS } from "./types.js";

export const OpenClawHandoffEligibilityFixture: HandoffEligibility =
  freezeHandoffEligibilityValue({
    id: "handoff-eligibility.execution-review.transport-request.openclaw.plan",
    status: "pending",
    decision: "not_eligible",
    reason: "approval_absent",
    evidence: {
      reviewedRequestId: "transport-request.openclaw.plan",
      reviewId: "execution-review.transport-request.openclaw.plan",
      provenanceId:
        "approval-provenance.execution-review.transport-request.openclaw.plan",
      provenanceReviewId: "execution-review.transport-request.openclaw.plan",
      policyVersion: "default-deny/v1",
      configurationVersion: "openclaw-plan-review/v1",
      mappingVersion: "loop-engine-openclaw-planning/v1",
      protocolVersion: "loop-engine-openclaw-planning/v1",
      runtimeContractVersion: "openclaw/v1",
      transportContractVersion: "local-process/v1",
      architectureRfcVersion: EXECUTION_ARCHITECTURE_RFC_VERSION,
      executionStarted: false,
    },
    requirements: HANDOFF_ELIGIBILITY_REQUIREMENT_IDS.map((id) =>
      requirement(id, "unknown", "evidence_incomplete"),
    ),
    metadata: { fixture: "openclaw-handoff-eligibility" },
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });

export function freezeHandoffEligibilityValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

export function requirement(
  id: HandoffEligibilityRequirementId,
  outcome: HandoffEligibilityRequirementOutcome,
  reason: HandoffEligibilityReason,
): HandoffEligibilityRequirement {
  return freezeHandoffEligibilityValue({ id, outcome, reason });
}

export function handoffEligibilityIdFor(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): string {
  const reviewId =
    reviewed?.reviewId ?? provenance?.reviewIdentifier ?? "missing-review";
  return `handoff-eligibility.${reviewId}`;
}

function emptyEvidence(): HandoffEligibilityEvidence {
  return freezeHandoffEligibilityValue({
    reviewedRequestId: "",
    reviewId: "",
    provenanceId: "",
    provenanceReviewId: "",
    policyVersion: "",
    configurationVersion: "",
    mappingVersion: "",
    protocolVersion: "",
    runtimeContractVersion: "",
    transportContractVersion: "",
    architectureRfcVersion: EXECUTION_ARCHITECTURE_RFC_VERSION,
    executionStarted: false,
  });
}

export function evidenceFor(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): HandoffEligibilityEvidence {
  if (!reviewed || !provenance) return emptyEvidence();
  return freezeHandoffEligibilityValue({
    reviewedRequestId: reviewed.id,
    reviewId: reviewed.reviewId,
    provenanceId: provenance.id,
    provenanceReviewId: provenance.reviewIdentifier,
    policyVersion: provenance.versions.policyVersion,
    configurationVersion: provenance.versions.configurationVersion,
    mappingVersion: provenance.versions.mappingVersion,
    protocolVersion: provenance.versions.protocolVersion,
    runtimeContractVersion: provenance.versions.runtimeContractVersion,
    transportContractVersion: provenance.versions.transportContractVersion,
    architectureRfcVersion: provenance.versions.architectureRfcVersion,
    executionStarted: false,
  });
}

function hasAdapterPayload(reviewed: ReviewedTransportRequest): boolean {
  const source = JSON.stringify(reviewed);
  return /adapterPayload|runtimePayload|dispatchInstruction|executionInstruction/i.test(
    source,
  );
}

export function buildHandoffRequirements(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): readonly HandoffEligibilityRequirement[] {
  if (!reviewed || !provenance) {
    return freezeHandoffEligibilityValue(
      HANDOFF_ELIGIBILITY_REQUIREMENT_IDS.map((id) =>
        requirement(
          id,
          id === "review_present" && reviewed
            ? "pass"
            : id === "provenance_present" && provenance
              ? "pass"
              : "unknown",
          "evidence_incomplete",
        ),
      ),
    );
  }

  const request = reviewed.sourceRequest;
  const adapterAbsent = !hasAdapterPayload(reviewed);
  const rows: Record<
    HandoffEligibilityRequirementId,
    readonly [HandoffEligibilityRequirementOutcome, HandoffEligibilityReason]
  > = {
    review_present: ["pass", "requirements_satisfied"],
    review_complete: [
      reviewed.reviewId && reviewed.id && reviewed.configurationId
        ? "pass"
        : "fail",
      "evidence_incomplete",
    ],
    review_consistent: [
      reviewed.reviewId === provenance.scope.reviewId &&
      reviewed.id === provenance.scope.reviewedRequestId
        ? "pass"
        : "fail",
      "evidence_mismatch",
    ],
    review_approved: [
      reviewed.approved && reviewed.handoffAllowed ? "pass" : "fail",
      "approval_absent",
    ],
    provenance_present: ["pass", "requirements_satisfied"],
    provenance_complete: [
      provenance.id &&
      provenance.reviewIdentifier &&
      provenance.evidence.approvalId
        ? "pass"
        : "fail",
      "evidence_incomplete",
    ],
    provenance_consistent: [
      provenance.reviewIdentifier === reviewed.reviewId ? "pass" : "fail",
      "evidence_mismatch",
    ],
    scope_consistent: [
      provenance.scope.reviewId === reviewed.reviewId &&
      provenance.scope.configurationId === reviewed.configurationId &&
      provenance.scope.reviewedRequestId === reviewed.id &&
      provenance.scope.reviewedStatus === reviewed.status
        ? "pass"
        : "fail",
      "evidence_mismatch",
    ],
    policy_version_consistent: [
      provenance.versions.policyVersion.length > 0 ? "pass" : "fail",
      "requirements_satisfied",
    ],
    configuration_version_consistent: [
      provenance.versions.configurationVersion.length > 0 ? "pass" : "fail",
      "requirements_satisfied",
    ],
    mapping_version_consistent: [
      provenance.versions.mappingVersion.length > 0 ? "pass" : "fail",
      "requirements_satisfied",
    ],
    protocol_version_consistent: [
      provenance.versions.protocolVersion.length > 0 ? "pass" : "fail",
      "requirements_satisfied",
    ],
    runtime_contract_version_consistent: [
      provenance.versions.runtimeContractVersion.length > 0 &&
      reviewed.runtimeId.length > 0
        ? "pass"
        : "fail",
      "requirements_satisfied",
    ],
    transport_contract_version_consistent: [
      provenance.versions.transportContractVersion.length > 0 &&
      reviewed.transportId.length > 0
        ? "pass"
        : "fail",
      "requirements_satisfied",
    ],
    architecture_version_consistent: [
      provenance.versions.architectureRfcVersion ===
      EXECUTION_ARCHITECTURE_RFC_VERSION
        ? "pass"
        : "fail",
      "requirements_satisfied",
    ],
    request_non_executable: [
      !reviewed.executable && !request.executable ? "pass" : "fail",
      reviewed.executable || request.executable
        ? "forbidden_executable_state"
        : "requirements_satisfied",
    ],
    adapter_request_absent: [
      adapterAbsent ? "pass" : "fail",
      adapterAbsent
        ? "requirements_satisfied"
        : "forbidden_adapter_materialization",
    ],
  };

  return freezeHandoffEligibilityValue(
    HANDOFF_ELIGIBILITY_REQUIREMENT_IDS.map((id) =>
      requirement(id, rows[id][0], rows[id][1]),
    ),
  );
}

export function decisionFor(
  requirements: readonly HandoffEligibilityRequirement[],
): readonly [HandoffEligibilityDecision, HandoffEligibilityReason] {
  if (requirements.some((item) => item.outcome === "unknown")) {
    return ["indeterminate", "evidence_incomplete"];
  }
  if (requirements.some((item) => item.outcome === "fail")) {
    const approvalFailure = requirements.some(
      (item) =>
        item.outcome === "fail" &&
        (item.id === "review_approved" || item.id === "provenance_consistent"),
    );
    return [
      "not_eligible",
      approvalFailure ? "approval_absent" : "evidence_mismatch",
    ];
  }
  return ["eligible", "requirements_satisfied"];
}

export function buildHandoffEligibility(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
  status: HandoffEligibilityStatus = "evaluated",
): HandoffEligibility {
  const requirements = buildHandoffRequirements(reviewed, provenance);
  const [decision, reason] = decisionFor(requirements);
  const metadata: HandoffEligibilityMetadata = freezeHandoffEligibilityValue({
    ...(reviewed?.metadata ?? provenance?.metadata ?? {}),
  });
  return freezeHandoffEligibilityValue({
    id: handoffEligibilityIdFor(reviewed, provenance),
    status,
    decision: status === "pending" ? "not_eligible" : decision,
    reason: status === "pending" ? "approval_absent" : reason,
    evidence: evidenceFor(reviewed, provenance),
    requirements,
    metadata,
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}

export function summarizeHandoffEligibility(
  eligibility: HandoffEligibility,
): HandoffEligibilitySummary {
  const passedRequirements = countReviewArchitectureItems(
    eligibility.requirements,
    (item) => item.outcome === "pass",
  );
  const failedRequirements = countReviewArchitectureItems(
    eligibility.requirements,
    (item) => item.outcome === "fail",
  );
  const unknownRequirements = countReviewArchitectureItems(
    eligibility.requirements,
    (item) => item.outcome === "unknown",
  );
  return freezeHandoffEligibilityValue({
    totalRequirements: eligibility.requirements.length,
    passedRequirements,
    failedRequirements,
    unknownRequirements,
    reviewPresent: eligibility.requirements.some(
      (item) => item.id === "review_present" && item.outcome === "pass",
    ),
    provenancePresent: eligibility.requirements.some(
      (item) => item.id === "provenance_present" && item.outcome === "pass",
    ),
    approvalExplicit: eligibility.requirements.some(
      (item) => item.id === "review_approved" && item.outcome === "pass",
    ),
    versionsConsistent: eligibility.requirements
      .filter((item) => item.id.endsWith("_version_consistent"))
      .every((item) => item.outcome === "pass"),
    requestNonExecutable: eligibility.requirements.some(
      (item) => item.id === "request_non_executable" && item.outcome === "pass",
    ),
    adapterRequestAbsent: eligibility.requirements.some(
      (item) => item.id === "adapter_request_absent" && item.outcome === "pass",
    ),
    defaultDenied: true,
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
  });
}

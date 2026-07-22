// HandoffEligibility (V11.5) is a declarative assessment of reviewed evidence.
// It is not authorization, handoff, dispatch, execution, or an adapter payload.

import type {
  ApprovalProvenance,
  ApprovalProvenanceMetadata,
} from "../provenance/types.js";
import type { ReviewedTransportRequest } from "../review/types.js";

export type HandoffEligibilityId = string;
export type HandoffEligibilityMetadata = ApprovalProvenanceMetadata;

export const HANDOFF_ELIGIBILITY_STATUSES = [
  "pending",
  "evaluated",
  "invalid",
] as const;

export type HandoffEligibilityStatus =
  (typeof HANDOFF_ELIGIBILITY_STATUSES)[number];

export const HANDOFF_ELIGIBILITY_DECISIONS = [
  "eligible",
  "not_eligible",
  "indeterminate",
] as const;

export type HandoffEligibilityDecision =
  (typeof HANDOFF_ELIGIBILITY_DECISIONS)[number];

export const HANDOFF_ELIGIBILITY_REASONS = [
  "requirements_satisfied",
  "approval_absent",
  "evidence_incomplete",
  "evidence_mismatch",
  "forbidden_executable_state",
  "forbidden_adapter_materialization",
] as const;

export type HandoffEligibilityReason =
  (typeof HANDOFF_ELIGIBILITY_REASONS)[number];

export const HANDOFF_ELIGIBILITY_REQUIREMENT_IDS = [
  "review_present",
  "review_complete",
  "review_consistent",
  "review_approved",
  "provenance_present",
  "provenance_complete",
  "provenance_consistent",
  "scope_consistent",
  "policy_version_consistent",
  "configuration_version_consistent",
  "mapping_version_consistent",
  "protocol_version_consistent",
  "runtime_contract_version_consistent",
  "transport_contract_version_consistent",
  "architecture_version_consistent",
  "request_non_executable",
  "adapter_request_absent",
] as const;

export type HandoffEligibilityRequirementId =
  (typeof HANDOFF_ELIGIBILITY_REQUIREMENT_IDS)[number];

export const HANDOFF_ELIGIBILITY_REQUIREMENT_OUTCOMES = [
  "pass",
  "fail",
  "unknown",
] as const;

export type HandoffEligibilityRequirementOutcome =
  (typeof HANDOFF_ELIGIBILITY_REQUIREMENT_OUTCOMES)[number];

export type HandoffEligibilityRequirement = Readonly<{
  id: HandoffEligibilityRequirementId;
  outcome: HandoffEligibilityRequirementOutcome;
  reason: HandoffEligibilityReason;
}>;

export type HandoffEligibilityEvidence = Readonly<{
  reviewedRequestId: ReviewedTransportRequest["id"];
  reviewId: ReviewedTransportRequest["reviewId"];
  provenanceId: ApprovalProvenance["id"];
  provenanceReviewId: ApprovalProvenance["reviewIdentifier"];
  policyVersion: string;
  configurationVersion: string;
  mappingVersion: string;
  protocolVersion: string;
  runtimeContractVersion: string;
  transportContractVersion: string;
  architectureRfcVersion: "rfc-execution-architecture-v11";
  executionStarted: false;
}>;

export type HandoffEligibility = Readonly<{
  id: HandoffEligibilityId;
  status: HandoffEligibilityStatus;
  decision: HandoffEligibilityDecision;
  reason: HandoffEligibilityReason;
  evidence: HandoffEligibilityEvidence;
  requirements: readonly HandoffEligibilityRequirement[];
  metadata: HandoffEligibilityMetadata;
  handoffAllowed: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export const HANDOFF_ELIGIBILITY_ERROR_CODES = [
  "handoff_review_missing",
  "handoff_provenance_missing",
  "handoff_review_invalid",
  "handoff_provenance_invalid",
  "handoff_review_not_approved",
  "handoff_provenance_not_approved",
  "handoff_scope_mismatch",
  "handoff_reference_mismatch",
  "handoff_policy_version_mismatch",
  "handoff_configuration_version_mismatch",
  "handoff_mapping_version_mismatch",
  "handoff_protocol_version_mismatch",
  "handoff_runtime_version_mismatch",
  "handoff_transport_version_mismatch",
  "handoff_architecture_version_mismatch",
  "handoff_executable_state_forbidden",
  "handoff_dispatchable_state_forbidden",
  "handoff_adapter_request_forbidden",
  "handoff_validation_failed",
] as const;

export type HandoffEligibilityErrorCode =
  (typeof HANDOFF_ELIGIBILITY_ERROR_CODES)[number];

export type HandoffEligibilityError = Readonly<{
  code: HandoffEligibilityErrorCode;
  message: string;
  details: HandoffEligibilityMetadata;
  executionStarted: false;
}>;

export type HandoffEligibilityDiagnostic = Readonly<{
  code: HandoffEligibilityErrorCode;
  message: string;
  details: HandoffEligibilityMetadata;
}>;

export type HandoffEligibilityValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly HandoffEligibilityDiagnostic[];
  error?: HandoffEligibilityError;
}>;

export type HandoffEligibilitySummary = Readonly<{
  totalRequirements: number;
  passedRequirements: number;
  failedRequirements: number;
  unknownRequirements: number;
  reviewPresent: boolean;
  provenancePresent: boolean;
  approvalExplicit: boolean;
  versionsConsistent: boolean;
  requestNonExecutable: boolean;
  adapterRequestAbsent: boolean;
  defaultDenied: true;
  handoffAllowed: false;
  dispatchable: false;
  executable: false;
}>;

export type HandoffEligibilityResult = Readonly<{
  status: HandoffEligibilityStatus;
  decision: HandoffEligibilityDecision;
  eligibility: HandoffEligibility;
  summary: HandoffEligibilitySummary;
  validation: HandoffEligibilityValidation;
  diagnostics: readonly HandoffEligibilityDiagnostic[];
  metadata: HandoffEligibilityMetadata;
  error?: HandoffEligibilityError;
  handoffAllowed: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type HandoffEligibilityEvaluator = (
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
) => HandoffEligibilityResult;

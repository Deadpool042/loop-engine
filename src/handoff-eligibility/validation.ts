import type { ApprovalProvenance } from "../provenance/types.js";
import { EXECUTION_ARCHITECTURE_RFC_VERSION } from "../provenance/support.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import {
  createHandoffEligibilityError,
  createHandoffEligibilityValidation,
} from "./errors.js";
import type {
  HandoffEligibilityErrorCode,
  HandoffEligibilityValidation,
} from "./types.js";

function invalid(
  code: HandoffEligibilityErrorCode,
  message: string,
): HandoffEligibilityValidation {
  return createHandoffEligibilityValidation(
    createHandoffEligibilityError(code, message),
  );
}

function containsAdapterMaterial(reviewed: ReviewedTransportRequest): boolean {
  return /adapterPayload|runtimePayload|dispatchInstruction|executionInstruction/i.test(
    JSON.stringify(reviewed),
  );
}

/** Validates declarative eligibility evidence only. It never resolves adapters. */
export function validateHandoffEligibility(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): HandoffEligibilityValidation {
  if (!reviewed) {
    return invalid(
      "handoff_review_missing",
      "Handoff eligibility requires a ReviewedTransportRequest.",
    );
  }
  if (!provenance) {
    return invalid(
      "handoff_provenance_missing",
      "Handoff eligibility requires ApprovalProvenance.",
    );
  }
  if (!reviewed.reviewId || !reviewed.id || !reviewed.configurationId) {
    return invalid(
      "handoff_review_invalid",
      "ReviewedTransportRequest evidence is incomplete.",
    );
  }
  if (!provenance.id || !provenance.reviewIdentifier) {
    return invalid(
      "handoff_provenance_invalid",
      "ApprovalProvenance evidence is incomplete.",
    );
  }
  if (!reviewed.approved || !reviewed.handoffAllowed) {
    return invalid(
      "handoff_review_not_approved",
      "ReviewedTransportRequest is not explicitly approved.",
    );
  }
  if (!provenance.approved || !provenance.evidence.approved) {
    return invalid(
      "handoff_provenance_not_approved",
      "ApprovalProvenance is not explicitly approved.",
    );
  }
  if (
    provenance.scope.reviewId !== reviewed.reviewId ||
    provenance.scope.reviewedRequestId !== reviewed.id ||
    provenance.scope.reviewedStatus !== reviewed.status
  ) {
    return invalid(
      "handoff_scope_mismatch",
      "ApprovalProvenance scope does not match reviewed request.",
    );
  }
  if (
    provenance.reviewIdentifier !== reviewed.reviewId ||
    provenance.scope.configurationId !== reviewed.configurationId
  ) {
    return invalid(
      "handoff_reference_mismatch",
      "ApprovalProvenance references do not match reviewed request.",
    );
  }
  if (!provenance.versions.policyVersion) {
    return invalid(
      "handoff_policy_version_mismatch",
      "Policy version evidence is missing.",
    );
  }
  if (!provenance.versions.configurationVersion) {
    return invalid(
      "handoff_configuration_version_mismatch",
      "Configuration version evidence is missing.",
    );
  }
  if (!provenance.versions.mappingVersion) {
    return invalid(
      "handoff_mapping_version_mismatch",
      "Mapping version evidence is missing.",
    );
  }
  if (!provenance.versions.protocolVersion) {
    return invalid(
      "handoff_protocol_version_mismatch",
      "Protocol version evidence is missing.",
    );
  }
  if (!provenance.versions.runtimeContractVersion) {
    return invalid(
      "handoff_runtime_version_mismatch",
      "Runtime contract version evidence is missing.",
    );
  }
  if (!provenance.versions.transportContractVersion) {
    return invalid(
      "handoff_transport_version_mismatch",
      "Transport contract version evidence is missing.",
    );
  }
  if (
    provenance.versions.architectureRfcVersion !==
    EXECUTION_ARCHITECTURE_RFC_VERSION
  ) {
    return invalid(
      "handoff_architecture_version_mismatch",
      "Architecture RFC version evidence is incompatible.",
    );
  }
  if (reviewed.executable || reviewed.sourceRequest.executable) {
    return invalid(
      "handoff_executable_state_forbidden",
      "ReviewedTransportRequest remains forbidden from executable state.",
    );
  }
  if (reviewed.dispatchable || reviewed.sourceRequest.dispatchable) {
    return invalid(
      "handoff_dispatchable_state_forbidden",
      "ReviewedTransportRequest remains forbidden from dispatchable state.",
    );
  }
  if (containsAdapterMaterial(reviewed)) {
    return invalid(
      "handoff_adapter_request_forbidden",
      "ReviewedTransportRequest must not contain adapter materialization.",
    );
  }
  return createHandoffEligibilityValidation();
}

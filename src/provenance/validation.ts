import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import { createApprovalError, createApprovalValidation } from "./errors.js";
import {
  configurationVersionFor,
  EXECUTION_ARCHITECTURE_RFC_VERSION,
} from "./support.js";
import type {
  ApprovalErrorCode,
  ApprovalProvenance,
  ApprovalValidation,
} from "./types.js";

function invalid(code: ApprovalErrorCode, message: string): ApprovalValidation {
  return createApprovalValidation(createApprovalError(code, message));
}

/** Pure provenance validation. It verifies evidence; it grants no authority. */
export function validateApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalValidation {
  if (!provenance.id || !provenance.reviewIdentifier) {
    return invalid(
      "approval_missing",
      "ApprovalProvenance requires provenance and review identifiers.",
    );
  }
  if (
    provenance.status !== "reviewPending" ||
    provenance.approved ||
    provenance.evidence.approved
  ) {
    return invalid(
      "approval_pending",
      "ApprovalProvenance must remain pending and not approved.",
    );
  }
  if (
    !provenance.scope.reviewId ||
    !provenance.scope.configurationId ||
    !provenance.scope.reviewedRequestId ||
    !provenance.evidence.approvalId ||
    !provenance.evidence.abstractApproverId
  ) {
    return invalid(
      "approval_invalid",
      "ApprovalProvenance has incomplete reference evidence.",
    );
  }
  if (
    provenance.versions.policyVersion !==
      authorization.requirement.policyVersion ||
    provenance.versions.configurationVersion !==
      configurationVersionFor(authorization) ||
    provenance.versions.mappingVersion !==
      authorization.requirement.mappingVersion ||
    provenance.versions.protocolVersion !==
      authorization.requirement.protocolVersion ||
    provenance.versions.runtimeContractVersion !==
      authorization.requirement.runtimeVersion ||
    provenance.versions.transportContractVersion !==
      authorization.requirement.transportVersion ||
    provenance.versions.architectureRfcVersion !==
      EXECUTION_ARCHITECTURE_RFC_VERSION
  ) {
    return invalid(
      "approval_version_mismatch",
      "ApprovalProvenance version evidence is incompatible.",
    );
  }
  if (
    provenance.reviewIdentifier !== reviewed.reviewId ||
    provenance.scope.reviewId !== reviewed.reviewId ||
    provenance.scope.configurationId !== authorization.id ||
    provenance.scope.reviewedRequestId !== reviewed.id ||
    provenance.scope.reviewedStatus !== reviewed.status ||
    reviewed.configurationId !== authorization.id
  ) {
    return invalid(
      "approval_reference_mismatch",
      "ApprovalProvenance references do not match reviewed request and configuration.",
    );
  }
  return createApprovalValidation();
}

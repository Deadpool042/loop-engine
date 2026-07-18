import type { HandoffEligibilityResult } from "../handoff-eligibility/types.js";
import {
  createDispatchDescriptorError,
  createDispatchDescriptorValidation,
} from "./errors.js";
import { EXECUTION_BOUNDARY_RFC_VERSION } from "./support.js";
import type {
  DispatchDescriptor,
  DispatchDescriptorErrorCode,
  DispatchDescriptorValidation,
  ExecutionAuthority,
} from "./types.js";

function invalid(
  code: DispatchDescriptorErrorCode,
  message: string,
): DispatchDescriptorValidation {
  return createDispatchDescriptorValidation(
    createDispatchDescriptorError(code, message),
  );
}

export function validateDispatchDescriptorInputs(
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
): DispatchDescriptorValidation {
  if (!eligibility) {
    return invalid(
      "dispatch_eligibility_missing",
      "DispatchDescriptor requires a HandoffEligibilityResult.",
    );
  }
  if (!authority) {
    return invalid(
      "dispatch_authority_missing",
      "DispatchDescriptor requires execution authority evidence.",
    );
  }
  if (!eligibility.validation.valid || eligibility.decision !== "eligible") {
    return invalid(
      "dispatch_eligibility_invalid",
      "DispatchDescriptor requires valid explicit eligibility evidence.",
    );
  }
  if (!authority.id || !authority.eligibilityId) {
    return invalid(
      "dispatch_authority_invalid",
      "Execution authority evidence is incomplete.",
    );
  }
  if (
    authority.status !== "granted" ||
    !authority.approved ||
    authority.revoked ||
    authority.expired
  ) {
    return invalid(
      "dispatch_authority_not_granted",
      "Execution authority is not explicitly granted.",
    );
  }

  const evidence = eligibility.eligibility.evidence;
  if (
    authority.eligibilityId !== eligibility.eligibility.id ||
    authority.reviewedRequestId !== evidence.reviewedRequestId ||
    authority.reviewId !== evidence.reviewId ||
    authority.provenanceId !== evidence.provenanceId
  ) {
    return invalid(
      "dispatch_reference_mismatch",
      "DispatchDescriptor references do not match eligibility evidence.",
    );
  }
  if (
    authority.policyVersion !== evidence.policyVersion ||
    authority.configurationVersion !== evidence.configurationVersion ||
    authority.mappingVersion !== evidence.mappingVersion ||
    authority.protocolVersion !== evidence.protocolVersion ||
    authority.runtimeContractVersion !== evidence.runtimeContractVersion ||
    authority.transportContractVersion !== evidence.transportContractVersion ||
    authority.architectureRfcVersion !== EXECUTION_BOUNDARY_RFC_VERSION
  ) {
    return invalid(
      "dispatch_version_mismatch",
      "DispatchDescriptor versions do not match reviewed evidence.",
    );
  }
  return createDispatchDescriptorValidation();
}

export function validateDispatchDescriptor(
  descriptor: DispatchDescriptor,
): DispatchDescriptorValidation {
  if (
    !descriptor.id ||
    !descriptor.evidence.eligibilityId ||
    !descriptor.evidence.authorityId ||
    !descriptor.evidence.reviewedRequestId ||
    !descriptor.evidence.reviewId ||
    !descriptor.evidence.provenanceId
  ) {
    return invalid(
      "dispatch_descriptor_incomplete",
      "DispatchDescriptor evidence is incomplete.",
    );
  }
  if (descriptor.executable) {
    return invalid(
      "dispatch_executable_state_forbidden",
      "DispatchDescriptor must never be executable.",
    );
  }
  if (descriptor.dispatchable || descriptor.readyForBoundary) {
    return invalid(
      "dispatch_dispatchable_state_forbidden",
      "DispatchDescriptor must not be dispatchable in V12.1.",
    );
  }
  return createDispatchDescriptorValidation();
}

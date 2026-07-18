import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { TransportRequest } from "../transport-request/types.js";
import {
  createExecutionReviewError,
  createExecutionReviewValidation,
} from "./errors.js";
import type {
  ExecutionReviewErrorCode,
  ExecutionReviewValidation,
} from "./types.js";

function invalid(
  code: ExecutionReviewErrorCode,
  message: string,
): ExecutionReviewValidation {
  return createExecutionReviewValidation(
    createExecutionReviewError(code, message),
  );
}

function metadataVersionMismatch(
  request: TransportRequest,
  key: string,
  expected: string,
): boolean {
  const value = request.metadata[key];
  return typeof value === "string" && value.length > 0 && value !== expected;
}

/** Pure reference validation. It never resolves adapters or crosses a boundary. */
export function validateTransportReview(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
): ExecutionReviewValidation {
  if (!request.id || !request.authorization.configurationId) {
    return invalid(
      "review_missing",
      "Execution review requires a TransportRequest with an authorization reference.",
    );
  }
  if (request.authorization.reviewRequired || authorization.reviewRequired) {
    return invalid(
      "review_required",
      "Authorization review is still required before execution review.",
    );
  }
  if (
    !request.providerId ||
    !request.mapping.mappingId ||
    !request.runtime.runtimeId ||
    !request.transport.transportId ||
    request.capabilities.length === 0 ||
    !request.policy.policyId ||
    !authorization.requirement.intentId
  ) {
    return invalid(
      "review_incomplete",
      "Execution review requires complete declarative references.",
    );
  }
  if (
    !authorization.active ||
    !authorization.approved ||
    !authorization.configured ||
    !request.authorization.authorized
  ) {
    return invalid(
      "review_not_approved",
      "Execution review requires approved authorization references.",
    );
  }
  if (
    metadataVersionMismatch(
      request,
      "policyVersion",
      authorization.requirement.policyVersion,
    ) ||
    metadataVersionMismatch(
      request,
      "protocolVersion",
      authorization.requirement.protocolVersion,
    ) ||
    metadataVersionMismatch(
      request,
      "mappingVersion",
      authorization.requirement.mappingVersion,
    ) ||
    metadataVersionMismatch(
      request,
      "runtimeVersion",
      authorization.requirement.runtimeVersion,
    ) ||
    metadataVersionMismatch(
      request,
      "transportVersion",
      authorization.requirement.transportVersion,
    )
  ) {
    return invalid(
      "review_version_mismatch",
      "Execution review version metadata is incompatible.",
    );
  }
  if (
    request.authorization.configurationId !== authorization.id ||
    request.providerId !== authorization.requirement.providerId ||
    request.provider !== authorization.requirement.provider ||
    request.mapping.mappingId !== authorization.requirement.mappingId ||
    request.runtime.runtimeId !== authorization.requirement.runtimeId ||
    request.transport.transportId !== authorization.requirement.transportId
  ) {
    return invalid(
      "review_configuration_mismatch",
      "Execution review configuration references are incompatible.",
    );
  }
  if (request.policy.configurationId !== authorization.id) {
    return invalid(
      "review_policy_mismatch",
      "Execution review policy reference is incompatible.",
    );
  }
  const approvedCapabilities =
    authorization.requirement.approvedTransportCapabilities;
  if (
    request.capabilities.some(
      (capability) => !approvedCapabilities.includes(capability.capabilityId),
    )
  ) {
    return invalid(
      "review_policy_mismatch",
      "Execution review capability references are not policy-approved.",
    );
  }
  return createExecutionReviewValidation();
}

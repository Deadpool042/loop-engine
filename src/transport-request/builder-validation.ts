import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ProviderExecutionPlan } from "../providers/types.js";
import {
  createTransportRequestBuilderError,
  createTransportRequestBuilderValidation,
} from "./builder-errors.js";
import type {
  TransportRequestBuilderErrorCode,
  TransportRequestBuilderValidation,
} from "./builder.js";

function invalid(
  code: TransportRequestBuilderErrorCode,
  message: string,
): TransportRequestBuilderValidation {
  return createTransportRequestBuilderValidation(
    createTransportRequestBuilderError(code, message),
  );
}

/** Pure reference validation. It never resolves Provider, Runtime, or Transport. */
export function validateTransportRequestBuild(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): TransportRequestBuilderValidation {
  if (!providerPlan.providerId || !providerPlan.provider) {
    return invalid(
      "builder_invalid_plan",
      "ProviderExecutionPlan must expose provider references.",
    );
  }
  if (providerPlan.providerId !== authorization.requirement.providerId) {
    return invalid(
      "builder_invalid_plan",
      "ProviderExecutionPlan providerId does not match authorization.",
    );
  }
  if (providerPlan.provider !== authorization.requirement.provider) {
    return invalid(
      "builder_invalid_plan",
      "ProviderExecutionPlan provider does not match authorization.",
    );
  }
  if (
    !authorization.active ||
    !authorization.approved ||
    !authorization.configured ||
    authorization.reviewRequired
  ) {
    return invalid(
      "builder_invalid_authorization",
      "AuthorizationConfiguration is not approved for request building.",
    );
  }
  if (!authorization.requirement.mappingId) {
    return invalid(
      "builder_invalid_mapping",
      "AuthorizationConfiguration has no mapping reference.",
    );
  }
  if (!authorization.requirement.intentId) {
    return invalid(
      "builder_invalid_intent",
      "AuthorizationConfiguration has no intent reference.",
    );
  }
  if (
    !authorization.requirement.runtimeId ||
    providerPlan.runtimeId !== authorization.requirement.runtimeId
  ) {
    return invalid(
      "builder_invalid_runtime_reference",
      "Runtime reference is missing or incompatible.",
    );
  }
  if (!authorization.requirement.transportId) {
    return invalid(
      "builder_invalid_transport_reference",
      "AuthorizationConfiguration has no transport reference.",
    );
  }
  if (authorization.requirement.approvedTransportCapabilities.length === 0) {
    return invalid(
      "builder_invalid_capability_reference",
      "AuthorizationConfiguration has no approved capability reference.",
    );
  }
  return createTransportRequestBuilderValidation();
}

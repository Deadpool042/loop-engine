import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ProviderExecutionPlan } from "../providers/types.js";
import {
  freezeTransportRequestValue,
  readTransportRequestMetadataString,
} from "./support.js";
import type {
  TransportRequest,
  TransportRequestMetadata,
} from "./types.js";
import type { TransportRequestBuilderSummary } from "./builder.js";

export function normalizeTransportRequestBuilderMetadata(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): TransportRequestMetadata {
  return Object.freeze({
    ...providerPlan.metadata,
    authorizationConfigurationId: authorization.id,
    authorizationReviewMetadata: authorization.reviewMetadata,
  });
}

function transportRequestId(
  metadata: TransportRequestMetadata,
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): string {
  return (
    readTransportRequestMetadataString(metadata, "transportRequestId") ??
    readTransportRequestMetadataString(metadata, "requestId") ??
    `transport-request.${providerPlan.providerId}.${authorization.id}`
  );
}

export function summarizeTransportRequestBuild(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
  request: TransportRequest | null,
): TransportRequestBuilderSummary {
  return Object.freeze({
    providerCompatible:
      providerPlan.providerId === authorization.requirement.providerId &&
      providerPlan.provider === authorization.requirement.provider,
    mappingReferenced: authorization.requirement.mappingId.length > 0,
    intentReferenced: authorization.requirement.intentId.length > 0,
    runtimeReferenced:
      authorization.requirement.runtimeId.length > 0 &&
      providerPlan.runtimeId === authorization.requirement.runtimeId,
    transportReferenced: authorization.requirement.transportId.length > 0,
    capabilityReferenced:
      authorization.requirement.approvedTransportCapabilities.length > 0,
    configurationApproved:
      authorization.active &&
      authorization.approved &&
      authorization.configured &&
      !authorization.reviewRequired,
    outputImmutable:
      request !== null &&
      Object.isFrozen(request) &&
      Object.isFrozen(request.mapping) &&
      Object.isFrozen(request.authorization) &&
      Object.isFrozen(request.runtime) &&
      Object.isFrozen(request.transport) &&
      Object.isFrozen(request.capabilities) &&
      Object.isFrozen(request.policy),
  });
}

export function buildTransportRequestFromReferences(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): TransportRequest {
  const metadata = normalizeTransportRequestBuilderMetadata(
    providerPlan,
    authorization,
  );
  return freezeTransportRequestValue({
    id: transportRequestId(metadata, providerPlan, authorization),
    status: "validation_required",
    providerId: providerPlan.providerId,
    provider: providerPlan.provider,
    mapping: { mappingId: authorization.requirement.mappingId },
    authorization: {
      configurationId: authorization.id,
      authorized:
        authorization.active &&
        authorization.approved &&
        authorization.configured &&
        !authorization.reviewRequired,
      reviewRequired: authorization.reviewRequired,
      executionStarted: false,
    },
    runtime: { runtimeId: authorization.requirement.runtimeId },
    transport: { transportId: authorization.requirement.transportId },
    capabilities:
      authorization.requirement.approvedTransportCapabilities.map(
        (capabilityId) => ({
          capabilityId,
          source: "authorization_configuration" as const,
        }),
      ),
    policy: {
      policyId: authorization.requirement.policyVersion,
      configurationId: authorization.id,
    },
    metadata,
    active: false,
    dispatchable: false,
    executable: false,
    validationRequired: true,
  });
}

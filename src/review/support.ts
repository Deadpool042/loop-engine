import type { AuthorizationConfiguration } from "../authorization/types.js";
import {
  freezeReviewArchitectureValue,
  readReviewArchitectureMetadataString,
  reviewArchitectureMetadataVersionCompatible,
} from "../review-architecture/shared.js";
import type { TransportRequest } from "../transport-request/types.js";
import type {
  ExecutionReview,
  ExecutionReviewSummary,
  ReviewedTransportRequest,
  ReviewedTransportRequestMetadata,
} from "./types.js";

export const OpenClawReviewedTransportRequestFixture: ReviewedTransportRequest =
  freezeReviewValue({
    id: "transport-request.openclaw.plan",
    reviewId: "execution-review.transport-request.openclaw.plan",
    status: "handoff_denied",
    sourceRequest: {
      id: "transport-request.openclaw.plan",
      status: "validation_required",
      providerId: "openclaw",
      provider: "local",
      mapping: { mappingId: "openclaw-planning" },
      authorization: {
        configurationId: "openclaw-plan-review",
        authorized: false,
        reviewRequired: true,
        executionStarted: false,
      },
      runtime: { runtimeId: "openclaw" },
      transport: { transportId: "local-process" },
      capabilities: [
        {
          capabilityId: "shell_exec",
          source: "authorization_configuration",
        },
      ],
      policy: {
        policyId: "openclaw-default-deny",
        configurationId: "openclaw-plan-review",
      },
      metadata: { fixture: "openclaw-reviewed-transport-request" },
      active: false,
      dispatchable: false,
      executable: false,
      validationRequired: true,
    },
    providerId: "openclaw",
    mappingId: "openclaw-planning",
    intentId: "openclaw-plan",
    runtimeId: "openclaw",
    transportId: "local-process",
    capabilityIds: ["shell_exec"],
    policyId: "openclaw-default-deny",
    configurationId: "openclaw-plan-review",
    metadata: { fixture: "openclaw-reviewed-transport-request" },
    approved: false,
    dispatchable: false,
    executable: false,
    handoffAllowed: false,
    executionStarted: false,
  });

export function freezeReviewValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

function metadataString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  return readReviewArchitectureMetadataString(metadata, key);
}

export function executionReviewIdFor(request: TransportRequest): string {
  return `execution-review.${request.id}`;
}

export function createExecutionReviewRecord(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
  metadata: ReviewedTransportRequestMetadata,
): ExecutionReview {
  return freezeReviewValue({
    id: executionReviewIdFor(request),
    requestId: request.id,
    configurationId: authorization.id,
    status: "reviewed",
    metadata,
    executionStarted: false,
  });
}

export function normalizeExecutionReviewMetadata(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
): ReviewedTransportRequestMetadata {
  return freezeReviewValue({
    ...request.metadata,
    configurationId: authorization.id,
    policyVersion: authorization.requirement.policyVersion,
    protocolVersion: authorization.requirement.protocolVersion,
    mappingVersion: authorization.requirement.mappingVersion,
    runtimeVersion: authorization.requirement.runtimeVersion,
    transportVersion: authorization.requirement.transportVersion,
  });
}

export function buildReviewedTransportRequest(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
): ReviewedTransportRequest {
  const metadata = normalizeExecutionReviewMetadata(request, authorization);
  return freezeReviewValue({
    id: request.id,
    reviewId: executionReviewIdFor(request),
    status: "not_approved",
    sourceRequest: request,
    providerId: request.providerId,
    mappingId: request.mapping.mappingId,
    intentId: authorization.requirement.intentId,
    runtimeId: request.runtime.runtimeId,
    transportId: request.transport.transportId,
    capabilityIds: request.capabilities.map(
      (capability) => capability.capabilityId,
    ),
    policyId: request.policy.policyId,
    configurationId: authorization.id,
    metadata,
    approved: false,
    dispatchable: false,
    executable: false,
    handoffAllowed: false,
    executionStarted: false,
  });
}

export function summarizeTransportReview(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
  reviewed: ReviewedTransportRequest | null,
): ExecutionReviewSummary {
  const metadataVersion = (key: string, expected: string) => {
    return reviewArchitectureMetadataVersionCompatible(
      request.metadata,
      key,
      expected,
    );
  };
  return freezeReviewValue({
    requestReferenced: request.id.length > 0,
    authorizationConsistent:
      request.authorization.configurationId === authorization.id &&
      request.authorization.authorized === authorization.approved &&
      request.authorization.reviewRequired === authorization.reviewRequired,
    configurationConsistent:
      request.providerId === authorization.requirement.providerId &&
      request.provider === authorization.requirement.provider,
    policyConsistent: request.policy.configurationId === authorization.id,
    mappingConsistent:
      request.mapping.mappingId === authorization.requirement.mappingId,
    intentConsistent: authorization.requirement.intentId.length > 0,
    runtimeConsistent:
      request.runtime.runtimeId === authorization.requirement.runtimeId,
    transportConsistent:
      request.transport.transportId === authorization.requirement.transportId,
    capabilityConsistent: request.capabilities.every((capability) =>
      authorization.requirement.approvedTransportCapabilities.includes(
        capability.capabilityId,
      ),
    ),
    reviewRequired: request.authorization.reviewRequired,
    authorizationApproved:
      authorization.active &&
      authorization.approved &&
      authorization.configured &&
      request.authorization.authorized,
    versionCompatible:
      metadataVersion(
        "policyVersion",
        authorization.requirement.policyVersion,
      ) &&
      metadataVersion(
        "protocolVersion",
        authorization.requirement.protocolVersion,
      ) &&
      metadataVersion(
        "mappingVersion",
        authorization.requirement.mappingVersion,
      ) &&
      metadataVersion(
        "runtimeVersion",
        authorization.requirement.runtimeVersion,
      ) &&
      metadataVersion(
        "transportVersion",
        authorization.requirement.transportVersion,
      ),
    reviewedImmutable: reviewed ? Object.isFrozen(reviewed) : false,
    approved: false,
    dispatchable: false,
    executable: false,
    handoffAllowed: false,
  });
}

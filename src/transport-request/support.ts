import type { TransportRequest, TransportRequestSummary } from "./types.js";
import {
  freezeReviewArchitectureValue,
  readReviewArchitectureMetadataString,
} from "../review-architecture/shared.js";

export const OpenClawTransportRequestFixture: TransportRequest = Object.freeze({
  id: "transport-request.openclaw.plan",
  status: "validation_required",
  providerId: "openclaw",
  provider: "local",
  mapping: Object.freeze({ mappingId: "openclaw-planning" }),
  authorization: Object.freeze({
    configurationId: "openclaw-plan-review",
    authorized: false,
    reviewRequired: true,
    executionStarted: false,
  }),
  runtime: Object.freeze({ runtimeId: "openclaw" }),
  transport: Object.freeze({ transportId: "local-process" }),
  capabilities: Object.freeze([
    Object.freeze({
      capabilityId: "shell_exec",
      source: "authorization_configuration",
    }),
  ]),
  policy: Object.freeze({
    policyId: "openclaw-default-deny",
    configurationId: "openclaw-plan-review",
  }),
  metadata: Object.freeze({ fixture: "openclaw-transport-request" }),
  active: false,
  dispatchable: false,
  executable: false,
  validationRequired: true,
});

export function freezeTransportRequestValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

export function readTransportRequestMetadataString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  return readReviewArchitectureMetadataString(metadata, key);
}

export function summarizeTransportRequest(
  request: TransportRequest,
): TransportRequestSummary {
  return Object.freeze({
    authorizationReferenced: request.authorization.configurationId.length > 0,
    providerReferenced: request.providerId.length > 0,
    mappingReferenced: request.mapping.mappingId.length > 0,
    runtimeReferenced: request.runtime.runtimeId.length > 0,
    transportReferenced: request.transport.transportId.length > 0,
    capabilityReferenced: request.capabilities.length > 0,
    policyReferenced: request.policy.policyId.length > 0,
    authorized: request.authorization.authorized,
    active: request.active,
    dispatchable: request.dispatchable,
    executable: request.executable,
    validationRequired: request.validationRequired,
  });
}

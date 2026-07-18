// TransportRequest (V11.1) is a declarative handoff contract. It references
// validated evidence only and never describes a process, command, filesystem,
// environment, or transport execution payload.

import type {
  AgentCapability,
  AgentProvider,
} from "../agents/types.js";
import type {
  AuthorizationConfigurationId,
  AuthorizationConfigurationResult,
} from "../authorization/types.js";
import type { ExecutableMappingId } from "../providers/mapping/types.js";
import type { ProviderId, ProviderMetadata } from "../providers/types.js";
import type { CapabilityId, PolicyId } from "../policy/types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { TransportId } from "../transports/types.js";

export type TransportRequestId = string;
export type TransportRequestMetadata = ProviderMetadata;

export type TransportRequestCapabilityReference = Readonly<{
  capabilityId: CapabilityId;
  source: "authorization_configuration";
}>;

export type TransportRequestRuntimeReference = Readonly<{
  runtimeId: RuntimeId;
}>;

export type TransportRequestTransportReference = Readonly<{
  transportId: TransportId;
}>;

export type TransportRequestPolicyReference = Readonly<{
  policyId: PolicyId;
  configurationId: AuthorizationConfigurationId;
}>;

export type TransportRequestMappingReference = Readonly<{
  mappingId: ExecutableMappingId;
}>;

export type TransportRequestAuthorizationReference = Readonly<{
  configurationId: AuthorizationConfigurationId;
  authorized: boolean;
  reviewRequired: boolean;
  executionStarted: false;
}>;

export const TRANSPORT_REQUEST_STATUSES = [
  "validation_required",
  "inactive",
  "not_dispatchable",
  "not_executable",
  "invalid",
] as const;

export type TransportRequestStatus =
  (typeof TRANSPORT_REQUEST_STATUSES)[number];

export const TRANSPORT_REQUEST_ERROR_CODES = [
  "transport_request_invalid",
  "transport_request_authorization_missing",
  "transport_request_provider_missing",
  "transport_request_mapping_missing",
  "transport_request_runtime_missing",
  "transport_request_transport_missing",
  "transport_request_capability_missing",
  "transport_request_policy_missing",
  "transport_request_not_authorized",
  "transport_request_not_dispatchable",
  "transport_request_not_executable",
] as const;

export type TransportRequestErrorCode =
  (typeof TRANSPORT_REQUEST_ERROR_CODES)[number];

export type TransportRequestError = Readonly<{
  code: TransportRequestErrorCode;
  message: string;
  details: TransportRequestMetadata;
  executionStarted: false;
}>;

export type TransportRequestDiagnostic = Readonly<{
  code: TransportRequestErrorCode;
  message: string;
  details: TransportRequestMetadata;
}>;

export type TransportRequestValidation = Readonly<{
  valid: false;
  diagnostics: readonly TransportRequestDiagnostic[];
  error: TransportRequestError;
}>;

export type TransportRequestSummary = Readonly<{
  authorizationReferenced: boolean;
  providerReferenced: boolean;
  mappingReferenced: boolean;
  runtimeReferenced: boolean;
  transportReferenced: boolean;
  capabilityReferenced: boolean;
  policyReferenced: boolean;
  authorized: boolean;
  active: boolean;
  dispatchable: boolean;
  executable: boolean;
  validationRequired: boolean;
}>;

export type TransportRequest = Readonly<{
  id: TransportRequestId;
  status: TransportRequestStatus;
  providerId: ProviderId;
  provider: AgentProvider;
  mapping: TransportRequestMappingReference;
  authorization: TransportRequestAuthorizationReference;
  runtime: TransportRequestRuntimeReference;
  transport: TransportRequestTransportReference;
  capabilities: readonly TransportRequestCapabilityReference[];
  policy: TransportRequestPolicyReference;
  metadata: TransportRequestMetadata;
  active: false;
  dispatchable: false;
  executable: false;
  validationRequired: true;
}>;

export type TransportRequestResult = Readonly<{
  status: TransportRequestStatus;
  request: TransportRequest;
  summary: TransportRequestSummary;
  validation: TransportRequestValidation;
  diagnostics: readonly TransportRequestDiagnostic[];
  metadata: TransportRequestMetadata;
  error: TransportRequestError;
  executionStarted: false;
}>;

export type TransportRequestCreationOptions = Readonly<{
  id?: TransportRequestId;
  metadata?: TransportRequestMetadata;
}>;

export type TransportRequestSource = Readonly<{
  configurationResult: AuthorizationConfigurationResult;
  options?: TransportRequestCreationOptions;
}>;

export type TransportRequestCapability = AgentCapability;

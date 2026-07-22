import type { AgentProvider } from "../agents/types.js";
import type {
  AuthorizationDecision,
  CapabilityId,
  PolicyId,
} from "../policy/types.js";
import type { ExecutableMappingId } from "../providers/mapping/types.js";
import type { ProviderId, ProviderMetadata } from "../providers/types.js";
import type { TransportIntentId } from "../providers/intent/types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { TransportId } from "../transports/types.js";

export const AUTHORIZATION_CONFIGURATION_IDS = [
  "openclaw-plan-review",
] as const;

export type AuthorizationConfigurationId =
  (typeof AUTHORIZATION_CONFIGURATION_IDS)[number];
export type AuthorizationConfigurationMetadata = ProviderMetadata;

export type AuthorizationConfigurationRequirement = Readonly<{
  providerId: ProviderId;
  provider: AgentProvider;
  protocolVersion: string;
  mappingId: ExecutableMappingId;
  intentId: TransportIntentId;
  runtimeId: RuntimeId;
  transportId: TransportId;
  approvedTransportCapabilities: readonly CapabilityId[];
  policyVersion: string;
  mappingVersion: string;
  runtimeVersion: string;
  transportVersion: string;
}>;

export type AuthorizationConfigurationPolicy = Readonly<{
  enabled: boolean;
  allowedConfigurationIds: readonly AuthorizationConfigurationId[];
}>;

/** Immutable review state with no credential or external approval system. */
export type AuthorizationConfiguration = Readonly<{
  id: AuthorizationConfigurationId;
  requirement: AuthorizationConfigurationRequirement;
  active: boolean;
  approved: boolean;
  reviewRequired: boolean;
  reviewMetadata: AuthorizationConfigurationMetadata;
  configured: boolean;
  supports: (request: AuthorizationConfigurationRequest) => boolean;
}>;

export const AUTHORIZATION_CONFIGURATION_ERROR_CODES = [
  "configuration_missing",
  "configuration_inactive",
  "configuration_unapproved",
  "configuration_review_required",
  "configuration_not_authorized",
  "configuration_provider_mismatch",
  "configuration_protocol_mismatch",
  "configuration_mapping_mismatch",
  "configuration_intent_mismatch",
  "configuration_runtime_mismatch",
  "configuration_transport_mismatch",
  "configuration_version_mismatch",
  "configuration_policy_denied",
] as const;

export type AuthorizationConfigurationErrorCode =
  (typeof AUTHORIZATION_CONFIGURATION_ERROR_CODES)[number];

export type AuthorizationConfigurationError = Readonly<{
  code: AuthorizationConfigurationErrorCode;
  message: string;
  details: AuthorizationConfigurationMetadata;
  executionStarted: false;
}>;

export type AuthorizationConfigurationDiagnostic = Readonly<{
  code: AuthorizationConfigurationErrorCode;
  message: string;
  details: AuthorizationConfigurationMetadata;
}>;

export const AUTHORIZATION_CONFIGURATION_STATUSES = [
  "configuration_missing",
  "configuration_inactive",
  "configuration_unapproved",
  "configuration_review_required",
  "configuration_not_authorized",
  "configuration_provider_mismatch",
  "configuration_protocol_mismatch",
  "configuration_mapping_mismatch",
  "configuration_intent_mismatch",
  "configuration_runtime_mismatch",
  "configuration_transport_mismatch",
  "configuration_version_mismatch",
  "configuration_policy_denied",
] as const;

export type AuthorizationConfigurationStatus =
  (typeof AUTHORIZATION_CONFIGURATION_STATUSES)[number];

export type AuthorizationConfigurationValidation = Readonly<{
  valid: false;
  diagnostics: readonly AuthorizationConfigurationDiagnostic[];
  error: AuthorizationConfigurationError;
}>;

/** Explicit locally supplied versions; never inferred from an implementation. */
export type AuthorizationConfigurationVersions = Readonly<{
  policyVersion: string;
  protocolVersion: string;
  mappingVersion: string;
  runtimeVersion: string;
  transportVersion: string;
}>;

export type AuthorizationConfigurationRequest = Readonly<{
  decision: AuthorizationDecision;
  versions: AuthorizationConfigurationVersions;
  policy: AuthorizationConfigurationPolicy;
  metadata: AuthorizationConfigurationMetadata;
  requestedConfiguration?: AuthorizationConfigurationId;
}>;

export type AuthorizationConfigurationSummary = Readonly<{
  decisionAuthorized: boolean;
  providerCompatible: boolean;
  protocolCompatible: boolean;
  mappingCompatible: boolean;
  intentCompatible: boolean;
  runtimeCompatible: boolean;
  transportCompatible: boolean;
  versionsCompatible: boolean;
  policyAllowed: boolean;
  active: boolean;
  approved: boolean;
  reviewRequired: boolean;
}>;

export type AuthorizationConfigurationResult = Readonly<{
  status: AuthorizationConfigurationStatus;
  configurationId: AuthorizationConfigurationId | null;
  decision: AuthorizationDecision;
  summary: AuthorizationConfigurationSummary;
  validation: AuthorizationConfigurationValidation;
  diagnostics: readonly AuthorizationConfigurationDiagnostic[];
  metadata: AuthorizationConfigurationMetadata;
  error: AuthorizationConfigurationError;
  executionStarted: false;
}>;

export type AuthorizationConfigurationRegistry = Readonly<{
  configurations: readonly AuthorizationConfiguration[];
}>;

export type AuthorizationConfigurationSelection =
  | Readonly<{ outcome: "selected"; configuration: AuthorizationConfiguration }>
  | Readonly<{ outcome: "rejected"; error: AuthorizationConfigurationError }>;

export type AuthorizationConfigurationResolution =
  | Readonly<{
      outcome: "resolved";
      configuration: AuthorizationConfiguration;
      request: AuthorizationConfigurationRequest;
    }>
  | Readonly<{ outcome: "rejected"; error: AuthorizationConfigurationError }>;

export type AuthorizationConfigurationPolicyId = PolicyId;

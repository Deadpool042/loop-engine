// Executable mappings (V10.5) are immutable capability declarations. They
// translate a validated Provider protocol envelope into a future transport
// plan without representing a command, environment, credential, or execution.

import type { AgentCapability, AgentProvider } from "../../agents/types.js";
import type {
  ProviderExecutionPlan,
  ProviderId,
  ProviderMetadata,
} from "../types.js";
import type { OpenClawProtocolPlan } from "../openclaw/types.js";
import type { RuntimeId } from "../../runtime/types.js";
import type { TransportId } from "../../transports/types.js";

export const EXECUTABLE_MAPPING_IDS = ["openclaw-planning"] as const;

export type ExecutableMappingId = (typeof EXECUTABLE_MAPPING_IDS)[number];
export type ExecutableMappingCapability = AgentCapability;
export type ExecutableMappingMetadata = ProviderMetadata;

/**
 * A mapping intent is deliberately declarative. It cannot carry a command,
 * executable location, arguments, environment, credentials, or transport
 * implementation. V10.5 always remains non-executable and unconfigured.
 */
export type ExecutableMappingIntent = Readonly<{
  executable: false;
  configured: false;
  transportId: "not_configured";
  requiredTransportCapabilities: readonly ExecutableMappingCapability[];
}>;

/** A separately supplied, default-deny authorization for mapping resolution. */
export type ExecutableMappingPolicy = Readonly<{
  enabled: boolean;
  allowedMappingIds: readonly ExecutableMappingId[];
}>;

/**
 * Immutable capability declaration joining one Provider protocol envelope to
 * a future transport-neutral intent. It never describes how a process runs.
 */
export type ExecutableMapping = Readonly<{
  id: ExecutableMappingId;
  providerId: ProviderId;
  provider: AgentProvider;
  runtimeId: RuntimeId;
  protocolVersion: string;
  operation: string;
  capabilities: readonly ExecutableMappingCapability[];
  requiredTransportCapabilities: readonly ExecutableMappingCapability[];
  enabled: boolean;
  configured: boolean;
  supports: (request: ExecutableMappingRequest) => boolean;
}>;

/**
 * Reuses Provider and protocol contracts rather than recreating task,
 * context, policy, or transport models. `protocolPlan` is optional solely so
 * unmapped Provider plans can be rejected without a parallel request type.
 */
export type ExecutableMappingRequest = Readonly<{
  providerPlan: ProviderExecutionPlan;
  protocolPlan?: OpenClawProtocolPlan;
  policy: ExecutableMappingPolicy;
  metadata: ExecutableMappingMetadata;
  requestedMapping?: ExecutableMappingId;
}>;

export const EXECUTABLE_MAPPING_ERROR_CODES = [
  "mapping_missing",
  "mapping_disabled",
  "mapping_not_supported",
  "mapping_not_authorized",
  "mapping_invalid",
  "mapping_provider_mismatch",
  "mapping_runtime_mismatch",
  "mapping_transport_mismatch",
  "mapping_policy_denied",
  "mapping_not_configured",
] as const;

export type ExecutableMappingErrorCode =
  (typeof EXECUTABLE_MAPPING_ERROR_CODES)[number];

export type ExecutableMappingError = Readonly<{
  code: ExecutableMappingErrorCode;
  message: string;
  details: ExecutableMappingMetadata;
  executionStarted: false;
}>;

export type ExecutableMappingDiagnostic = Readonly<{
  code: ExecutableMappingErrorCode;
  message: string;
  details: ExecutableMappingMetadata;
}>;

export const EXECUTABLE_MAPPING_STATUSES = [
  "mapping_missing",
  "mapping_disabled",
  "mapping_not_supported",
  "mapping_not_authorized",
  "mapping_invalid",
  "mapping_provider_mismatch",
  "mapping_runtime_mismatch",
  "mapping_transport_mismatch",
  "mapping_policy_denied",
  "mapping_not_configured",
] as const;

export type ExecutableMappingStatus =
  (typeof EXECUTABLE_MAPPING_STATUSES)[number];

export type ExecutableMappingResult = Readonly<{
  status: ExecutableMappingStatus;
  mappingId: ExecutableMappingId | null;
  providerPlan: ProviderExecutionPlan;
  intent: ExecutableMappingIntent;
  diagnostics: readonly ExecutableMappingDiagnostic[];
  metadata: ExecutableMappingMetadata;
  error: ExecutableMappingError;
  executionStarted: false;
}>;

export type ExecutableMappingRegistry = Readonly<{
  mappings: readonly ExecutableMapping[];
}>;

export type ExecutableMappingSelection =
  | Readonly<{ outcome: "selected"; mapping: ExecutableMapping }>
  | Readonly<{ outcome: "rejected"; error: ExecutableMappingError }>;

export type ExecutableMappingResolution =
  | Readonly<{
      outcome: "resolved";
      mapping: ExecutableMapping;
      request: ExecutableMappingRequest;
    }>
  | Readonly<{ outcome: "rejected"; error: ExecutableMappingError }>;

/** Contract-only transport reference, kept here to document the boundary. */
export type ExecutableMappingTransportId = TransportId | "not_configured";

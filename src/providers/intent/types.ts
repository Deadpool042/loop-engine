// Transport intents (V10.6) are immutable declarations between an executable
// mapping and a future transport boundary. They never describe a command,
// environment, working directory, process options, or execution.

import type {
  AgentCapability,
  AgentPermission,
  AgentProvider,
} from "../../agents/types.js";
import type {
  ExecutableMappingId,
  ExecutableMappingResult,
} from "../mapping/types.js";
import type {
  ProviderExecutionPlan,
  ProviderId,
  ProviderMetadata,
} from "../types.js";
import type { RuntimeId } from "../../runtime/types.js";
import type { TransportId } from "../../transports/types.js";

export const TRANSPORT_INTENT_IDS = ["openclaw-plan"] as const;

export type TransportIntentId = (typeof TRANSPORT_INTENT_IDS)[number];
export type TransportIntentCapability = AgentCapability;
export type TransportIntentMetadata = ProviderMetadata;

/** A separate default-deny policy for declarative intent resolution. */
export type TransportIntentPolicy = Readonly<{
  enabled: boolean;
  allowedIntentIds: readonly TransportIntentId[];
}>;

/**
 * Immutable description of a desired transport and its requirements. The
 * contract intentionally stops before any transport payload or execution API.
 */
export type TransportIntent = Readonly<{
  id: TransportIntentId;
  providerId: ProviderId;
  provider: AgentProvider;
  runtimeId: RuntimeId;
  mappingId: ExecutableMappingId;
  transportId: TransportId;
  requiredCapabilities: readonly TransportIntentCapability[];
  requiredPermissions: readonly AgentPermission[];
  requiresPolicy: true;
  active: boolean;
  configured: boolean;
  supports: (request: TransportIntentRequest) => boolean;
}>;

/** Reuses the Provider and mapping outcomes; no parallel task or runtime model. */
export type TransportIntentRequest = Readonly<{
  providerPlan: ProviderExecutionPlan;
  mappingResult: ExecutableMappingResult;
  policy: TransportIntentPolicy;
  metadata: TransportIntentMetadata;
  requestedIntent?: TransportIntentId;
}>;

export const TRANSPORT_INTENT_ERROR_CODES = [
  "intent_missing",
  "intent_disabled",
  "intent_invalid",
  "intent_provider_mismatch",
  "intent_runtime_mismatch",
  "intent_mapping_mismatch",
  "intent_transport_mismatch",
  "intent_policy_denied",
  "intent_not_configured",
] as const;

export type TransportIntentErrorCode =
  (typeof TRANSPORT_INTENT_ERROR_CODES)[number];

export type TransportIntentError = Readonly<{
  code: TransportIntentErrorCode;
  message: string;
  details: TransportIntentMetadata;
  executionStarted: false;
}>;

export type TransportIntentDiagnostic = Readonly<{
  code: TransportIntentErrorCode;
  message: string;
  details: TransportIntentMetadata;
}>;

export const TRANSPORT_INTENT_STATUSES = [
  "intent_missing",
  "intent_disabled",
  "intent_invalid",
  "intent_provider_mismatch",
  "intent_runtime_mismatch",
  "intent_mapping_mismatch",
  "intent_transport_mismatch",
  "intent_policy_denied",
  "intent_not_configured",
] as const;

export type TransportIntentStatus = (typeof TRANSPORT_INTENT_STATUSES)[number];

export type TransportIntentValidation = Readonly<{
  valid: false;
  diagnostics: readonly TransportIntentDiagnostic[];
  error: TransportIntentError;
}>;

export type TransportIntentResult = Readonly<{
  status: TransportIntentStatus;
  intentId: TransportIntentId | null;
  providerPlan: ProviderExecutionPlan;
  mappingResult: ExecutableMappingResult;
  desiredTransport: TransportId | "not_configured";
  requiredCapabilities: readonly TransportIntentCapability[];
  requiredPermissions: readonly AgentPermission[];
  validation: TransportIntentValidation;
  diagnostics: readonly TransportIntentDiagnostic[];
  metadata: TransportIntentMetadata;
  error: TransportIntentError;
  executionStarted: false;
}>;

export type TransportIntentRegistry = Readonly<{
  intents: readonly TransportIntent[];
}>;

export type TransportIntentSelection =
  | Readonly<{ outcome: "selected"; intent: TransportIntent }>
  | Readonly<{ outcome: "rejected"; error: TransportIntentError }>;

export type TransportIntentResolution =
  | Readonly<{
      outcome: "resolved";
      intent: TransportIntent;
      request: TransportIntentRequest;
    }>
  | Readonly<{ outcome: "rejected"; error: TransportIntentError }>;

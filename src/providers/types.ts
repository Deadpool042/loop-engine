// Provider adapters (V10.2) translate provider-neutral RuntimeRequests into
// inert, inspectable plans. They never execute a transport, read credentials,
// or make network calls.

import type {
  AgentCapability,
  AgentPermission,
  AgentProvider,
} from "../agents/types.js";
import type {
  RuntimeId,
  RuntimeMetadata,
  RuntimeRequest,
} from "../runtime/types.js";

export const PROVIDER_IDS = ["openclaw", "claude-code", "codex"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Reuses the existing capability vocabulary rather than defining a parallel one. */
export type ProviderCapability = AgentCapability;

export type ProviderMetadata = RuntimeMetadata;

/**
 * Normalized input for a provider adapter. It deliberately contains no
 * credential, environment, executable, or shell command information.
 */
export type ProviderRequest = Readonly<{
  runtimeRequest: RuntimeRequest;
  requiredCapabilities: readonly ProviderCapability[];
  metadata: ProviderMetadata;
  requestedProvider?: ProviderId;
}>;

export const PROVIDER_ERROR_CODES = [
  "provider_not_found",
  "provider_not_allowed",
  "provider_not_supported",
  "capability_not_supported",
  "invalid_provider_request",
  "provider_not_implemented",
  "transport_not_available",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export type ProviderError = Readonly<{
  code: ProviderErrorCode;
  message: string;
  details: ProviderMetadata;
  executionStarted: boolean;
}>;

export type ProviderDiagnostic = Readonly<{
  code: string;
  message: string;
  details: ProviderMetadata;
}>;

export const PROVIDER_PLAN_STATUSES = [
  "not_implemented",
  "unsupported",
] as const;

export type ProviderExecutionPlanStatus =
  (typeof PROVIDER_PLAN_STATUSES)[number];

/**
 * A plan is intentionally transport-neutral in V10.2. A future provider
 * integration may add a structured transport request without exposing a shell
 * command string or the local-process policy.
 */
export type ProviderExecutionPlan = Readonly<{
  providerId: ProviderId;
  provider: AgentProvider;
  runtimeId: RuntimeId;
  status: ProviderExecutionPlanStatus;
  transport: "not_configured";
  requiredPermissions: readonly AgentPermission[];
  diagnostics: readonly ProviderDiagnostic[];
  metadata: ProviderMetadata;
  error: ProviderError;
}>;

export const PROVIDER_RESULT_STATUSES = [
  "not_implemented",
  "unsupported",
] as const;

export type ProviderResultStatus = (typeof PROVIDER_RESULT_STATUSES)[number];

/** A normalized, provider-neutral input retained inside the adapter boundary. */
export type ProviderRawResult = Readonly<{
  status: ProviderResultStatus;
  output: unknown;
  diagnostics: readonly ProviderDiagnostic[];
  startedAt: string;
  completedAt: string;
  metadata: ProviderMetadata;
  exitCode?: number | null;
  signal?: string | null;
}>;

export type ProviderResult = Readonly<{
  providerId: ProviderId;
  runtimeId: RuntimeId;
  status: ProviderResultStatus;
  output: unknown;
  diagnostics: readonly ProviderDiagnostic[];
  startedAt: string;
  completedAt: string;
  metadata: ProviderMetadata;
  error?: ProviderError;
  exitCode?: number | null;
  signal?: string | null;
}>;

/** Minimal, inert provider contract; execution belongs to a future transport. */
export type ProviderAdapter = Readonly<{
  id: ProviderId;
  provider: AgentProvider;
  runtimeId: RuntimeId;
  capabilities: readonly ProviderCapability[];
  supports: (request: ProviderRequest) => boolean;
  prepare: (request: ProviderRequest) => ProviderExecutionPlan;
  normalize: (result: ProviderRawResult) => ProviderResult;
}>;

export type ProviderSelectionResult =
  | Readonly<{ outcome: "selected"; adapter: ProviderAdapter }>
  | Readonly<{ outcome: "rejected"; error: ProviderError }>;

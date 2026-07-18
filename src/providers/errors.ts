import type {
  ProviderDiagnostic,
  ProviderError,
  ProviderErrorCode,
  ProviderExecutionPlan,
  ProviderId,
  ProviderMetadata,
  ProviderRawResult,
  ProviderResult,
  ProviderResultStatus,
} from "./types.js";
import type { AgentPermission, AgentProvider } from "../agents/types.js";
import type { RuntimeId } from "../runtime/types.js";

export function createProviderError(
  code: ProviderErrorCode,
  message: string,
  details: ProviderMetadata = {},
  executionStarted = false,
): ProviderError {
  return { code, message, details, executionStarted };
}

function diagnostic(error: ProviderError): ProviderDiagnostic {
  return { code: error.code, message: error.message, details: error.details };
}

export function createNotImplementedProviderPlan(
  providerId: ProviderId,
  provider: AgentProvider,
  runtimeId: RuntimeId,
  requiredPermissions: readonly AgentPermission[],
  metadata: ProviderMetadata,
): ProviderExecutionPlan {
  const error = createProviderError(
    "provider_not_implemented",
    `Provider ${providerId} is not implemented.`,
  );

  return {
    providerId,
    provider,
    runtimeId,
    status: "not_implemented",
    transport: "not_configured",
    requiredPermissions,
    diagnostics: [diagnostic(error)],
    metadata,
    error,
  };
}

export function createUnsupportedProviderPlan(
  providerId: ProviderId,
  provider: AgentProvider,
  runtimeId: RuntimeId,
  requiredPermissions: readonly AgentPermission[],
  metadata: ProviderMetadata,
  error: ProviderError,
): ProviderExecutionPlan {
  return {
    providerId,
    provider,
    runtimeId,
    status: "unsupported",
    transport: "not_configured",
    requiredPermissions,
    diagnostics: [diagnostic(error)],
    metadata,
    error,
  };
}

export function normalizeProviderResult(
  providerId: ProviderId,
  runtimeId: RuntimeId,
  result: ProviderRawResult,
): ProviderResult {
  return {
    providerId,
    runtimeId,
    status: result.status,
    output: result.output,
    diagnostics: result.diagnostics,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    metadata: result.metadata,
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    ...(result.signal === undefined ? {} : { signal: result.signal }),
  };
}

export function createProviderResult(
  providerId: ProviderId,
  runtimeId: RuntimeId,
  status: ProviderResultStatus,
  metadata: ProviderMetadata,
  error: ProviderError,
): ProviderResult {
  return {
    providerId,
    runtimeId,
    status,
    output: null,
    diagnostics: [diagnostic(error)],
    startedAt: "",
    completedAt: "",
    metadata,
    error,
  };
}

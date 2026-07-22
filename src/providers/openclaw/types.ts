// OpenClaw protocol design (V10.4). This is a Loop Engine internal planning
// schema, not an assertion about an OpenClaw product protocol or CLI.

import type {
  AgentCapability,
  AgentPermission,
  AgentProvider,
} from "../../agents/types.js";
import type { RuntimeId, RuntimeMetadata } from "../../runtime/types.js";

export const OPENCLAW_PROTOCOL_VERSIONS = [
  "loop-engine-openclaw-planning/v1",
] as const;

export type OpenClawProtocolVersion =
  (typeof OPENCLAW_PROTOCOL_VERSIONS)[number];

/** `plan` mirrors the existing read-only LoopRunner planning objective only. */
export const OPENCLAW_OPERATIONS = ["plan"] as const;
export type OpenClawOperation = (typeof OPENCLAW_OPERATIONS)[number];

export type OpenClawProtocolMetadata = RuntimeMetadata;

export type OpenClawContextReference = Readonly<{
  projectId: string;
  fileCount: number;
  totalCharacters: number;
  estimatedTokens: number;
  truncated: boolean;
}>;

export type OpenClawInput = Readonly<{
  projectId: string;
  taskId: string;
  context: OpenClawContextReference;
}>;

export type OpenClawExecutionIntent = Readonly<{
  requiredTransportCapabilities: readonly AgentCapability[];
  executable: false;
  executableMapping: "absent";
}>;

export type OpenClawOperationDefinition = Readonly<{
  operation: OpenClawOperation;
  requiredProviderCapabilities: readonly AgentCapability[];
  requiredAgentPermissions: readonly AgentPermission[];
  requiredRuntimeCapabilities: readonly AgentCapability[];
  requiredTransportCapabilities: readonly AgentCapability[];
  protocolValid: true;
  executable: false;
}>;

export type OpenClawRequest = Readonly<{
  protocolVersion: string;
  operation: string;
  providerId: "openclaw";
  provider: AgentProvider;
  runtimeId: RuntimeId;
  input: OpenClawInput;
  requiredProviderCapabilities: readonly AgentCapability[];
  requiredPermissions: readonly AgentPermission[];
  requiredRuntimeCapabilities: readonly AgentCapability[];
  requiredTransportCapabilities: readonly AgentCapability[];
  metadata: OpenClawProtocolMetadata;
}>;

export const OPENCLAW_PROTOCOL_ERROR_CODES = [
  "openclaw_protocol_version_missing",
  "openclaw_protocol_version_unsupported",
  "openclaw_operation_missing",
  "openclaw_operation_unsupported",
  "openclaw_request_invalid",
  "openclaw_context_invalid",
  "openclaw_capability_not_supported",
  "openclaw_permission_denied",
  "openclaw_runtime_not_supported",
  "openclaw_transport_not_supported",
  "openclaw_protocol_not_configured",
  "openclaw_executable_mapping_missing",
] as const;

export type OpenClawProtocolErrorCode =
  (typeof OPENCLAW_PROTOCOL_ERROR_CODES)[number];

export type OpenClawProtocolDiagnostic = Readonly<{
  code: OpenClawProtocolErrorCode | "openclaw_protocol_valid";
  message: string;
  details: OpenClawProtocolMetadata;
}>;

export type OpenClawProtocolError = Readonly<{
  code: OpenClawProtocolErrorCode;
  message: string;
  details: OpenClawProtocolMetadata;
  executionStarted: false;
}>;

export type OpenClawProtocolValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly OpenClawProtocolDiagnostic[];
  error?: OpenClawProtocolError;
}>;

export const OPENCLAW_PROTOCOL_STATUSES = [
  "invalid",
  "valid_non_executable",
] as const;

export type OpenClawProtocolStatus =
  (typeof OPENCLAW_PROTOCOL_STATUSES)[number];

export type OpenClawProtocolPlan = Readonly<{
  status: OpenClawProtocolStatus;
  request: OpenClawRequest;
  validation: OpenClawProtocolValidation;
  executionIntent: OpenClawExecutionIntent;
  diagnostics: readonly OpenClawProtocolDiagnostic[];
  error: OpenClawProtocolError;
}>;

export type OpenClawProtocolResponse = Readonly<{
  status: OpenClawProtocolStatus;
  plan: OpenClawProtocolPlan;
  diagnostics: readonly OpenClawProtocolDiagnostic[];
  error: OpenClawProtocolError;
}>;

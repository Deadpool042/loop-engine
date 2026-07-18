// Transport adapters (V10.3) are the sole explicit execution boundary between
// provider plans and guarded local backends. They remain provider-agnostic.

import type { AgentCapability, AgentProvider } from "../agents/types.js";
import type {
  LocalProcessCommand,
  LocalProcessExecutionPolicy,
  RuntimeEvent,
  RuntimeId,
  RuntimeMetadata,
  RuntimeRequest,
} from "../runtime/types.js";

export const TRANSPORT_IDS = ["local-process"] as const;

export type TransportId = (typeof TRANSPORT_IDS)[number];
export type TransportCapability = AgentCapability;
export type TransportMetadata = RuntimeMetadata;

/** A separately supplied, default-deny authorization for a transport. */
export type TransportExecutionPolicy = Readonly<{
  enabled: boolean;
  allowedTransportIds: readonly TransportId[];
}>;

/**
 * A validated, structured request for one transport. Commands remain an
 * executable plus argument vector; a shell command string and unfiltered
 * environments are not represented by this contract.
 */
export type TransportAdapterRequest = Readonly<{
  transportId: TransportId;
  providerId: string;
  provider: AgentProvider;
  runtimeId: RuntimeId;
  requiredCapabilities: readonly TransportCapability[];
  command: LocalProcessCommand;
  localProcessPolicy: LocalProcessExecutionPolicy;
  transportPolicy: TransportExecutionPolicy;
  runtimeRequest: RuntimeRequest;
  metadata: TransportMetadata;
}>;

export const TRANSPORT_ERROR_CODES = [
  "transport_not_found",
  "transport_not_allowed",
  "transport_not_supported",
  "transport_disabled",
  "capability_not_supported",
  "invalid_transport_request",
  "provider_plan_not_executable",
  "permission_denied",
  "executable_not_allowed",
  "working_directory_outside_project",
  "timeout_invalid",
  "output_limit_invalid",
  "transport_execution_failed",
] as const;

export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[number];

export type TransportError = Readonly<{
  code: TransportErrorCode;
  message: string;
  details: TransportMetadata;
  executionStarted: boolean;
}>;

export type TransportEvent = RuntimeEvent;

export const TRANSPORT_STATUSES = [
  "completed",
  "rejected",
  "spawn_failed",
  "non_zero_exit",
  "timed_out",
  "stdout_limit_exceeded",
  "stderr_limit_exceeded",
  "not_supported",
] as const;

export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export type TransportResult = Readonly<{
  transportId: TransportId;
  providerId: string;
  runtimeId: RuntimeId;
  status: TransportStatus;
  executionStarted: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  events: readonly TransportEvent[];
  diagnostics: readonly string[];
  metadata: TransportMetadata;
  error?: TransportError;
}>;

export type TransportExecution = TransportResult | Promise<TransportResult>;

export type TransportAdapter = Readonly<{
  id: TransportId;
  capabilities: readonly TransportCapability[];
  supports: (request: TransportAdapterRequest) => boolean;
  execute: (request: TransportAdapterRequest) => TransportExecution;
}>;

export type TransportRegistry = Readonly<{
  adapters: readonly TransportAdapter[];
}>;

export type TransportSelection =
  | Readonly<{ outcome: "selected"; adapter: TransportAdapter }>
  | Readonly<{ outcome: "rejected"; error: TransportError }>;

export type TransportResolution =
  | Readonly<{
      outcome: "resolved";
      adapter: TransportAdapter;
      request: TransportAdapterRequest;
    }>
  | Readonly<{ outcome: "rejected"; error: TransportError }>;

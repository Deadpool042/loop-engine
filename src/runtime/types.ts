// Runtime abstraction. V10.0 adapters are deterministic stubs; V10.1 adds one
// explicitly authorised local process boundary. No network, SDK, plugin
// discovery, or provider-specific task execution is implemented.

import type {
  AgentCapability,
  AgentEffort,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type { MinimalContextPackage } from "../context/types.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type {
  AgentPolicyMode,
  AgentPolicyResolution,
} from "../policy/types.js";

export type RuntimeMetadata = Readonly<Record<string, unknown>>;

/** Runtime identifiers may extend agent runtime labels without changing them. */
export type RuntimeId = AgentRuntime | "local-process";

export const LOCAL_PROCESS_RUNTIME_ID = "local-process" as const;

/**
 * A command is deliberately structured: there is no shell command string.
 * Its permissions and resource limits are supplied separately by policy.
 */
export type LocalProcessCommand = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  environment?: Readonly<Record<string, string>>;
  stdin?: string | null;
}>;

/** Explicit caller-controlled permission and resource boundary. */
export type LocalProcessExecutionPolicy = Readonly<{
  enabled: boolean;
  projectRoot: string;
  allowedExecutables: readonly string[];
  allowedEnvironmentKeys: readonly string[];
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
}>;

export type LocalProcessRuntimeRequest = Readonly<{
  command: LocalProcessCommand;
  executionPolicy: LocalProcessExecutionPolicy;
}>;

/**
 * A request assembled by Core after policy and context resolution.
 * It reuses existing domain contracts rather than defining parallel task,
 * policy, context, provider, or effort models.
 */
export type RuntimeRequest = Readonly<{
  task: RoadmapCandidate;
  mode: AgentPolicyMode;
  contextPackage: MinimalContextPackage;
  resolvedAgentPolicy: AgentPolicyResolution;
  provider: AgentProvider;
  effort: AgentEffort;
  requestedAt: string;
  metadata: RuntimeMetadata;
  requestedRuntime?: RuntimeId;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly RuntimeId[];
  /** Present only for an explicit local-process execution request. */
  localProcess?: LocalProcessRuntimeRequest;
}>;

export const RUNTIME_RESULT_STATUSES = [
  "not_implemented",
  "unsupported",
  "completed",
  "denied",
  "spawn_failed",
  "non_zero_exit",
  "timed_out",
  "stdout_limit_exceeded",
  "stderr_limit_exceeded",
] as const;

export type RuntimeResultStatus = (typeof RUNTIME_RESULT_STATUSES)[number];

export const RUNTIME_ERROR_CODES = [
  "permission_denied",
  "runtime_disabled",
  "invalid_request",
  "executable_not_allowed",
  "working_directory_outside_project",
  "environment_key_not_allowed",
  "spawn_failed",
  "timed_out",
  "stdout_limit_exceeded",
  "stderr_limit_exceeded",
  "non_zero_exit",
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export type RuntimeExecutionError = Readonly<{
  code: RuntimeErrorCode;
  message: string;
  details: RuntimeMetadata;
  processStarted: boolean;
}>;

export const RUNTIME_EVENT_TYPES = [
  "request_validated",
  "process_started",
  "stdout_received",
  "stderr_received",
  "process_completed",
  "process_failed",
  "process_terminated",
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export type RuntimeEvent = Readonly<{
  type: RuntimeEventType;
  sequence: number;
  data: RuntimeMetadata;
}>;

/** Additive result shape reserved for a future real execution boundary. */
export type RuntimeResult = Readonly<{
  runtimeId: RuntimeId | null;
  status: RuntimeResultStatus;
  startedAt: string;
  completedAt: string;
  diagnostics: readonly string[];
  output: unknown;
  metadata: RuntimeMetadata;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  error?: RuntimeExecutionError;
  events?: readonly RuntimeEvent[];
}>;

export type RuntimeExecution = RuntimeResult | Promise<RuntimeResult>;

/**
 * Legacy V10 adapter labels used by agent policy. They are not V13
 * RuntimeCapability declarations and no implicit conversion is allowed.
 */
export type RuntimeAdapterAgentCapability = AgentCapability;

/**
 * Minimal stable runtime contract. `capabilities` is declarative only; a stub
 * advertises no executable capability and `execute` always returns a result.
 * The field retains its V10 shape for compatibility and carries agent-policy
 * labels, not RuntimeCapability declarations.
 */
export type RuntimeAdapter = Readonly<{
  runtimeId: RuntimeId;
  capabilities: readonly RuntimeAdapterAgentCapability[];
  supports: (request: RuntimeRequest) => boolean;
  execute: (request: RuntimeRequest) => RuntimeExecution;
}>;

export type RuntimeSelectionResult =
  | Readonly<{ outcome: "selected"; adapter: RuntimeAdapter }>
  | Readonly<{ outcome: "unsupported"; reason: string }>;

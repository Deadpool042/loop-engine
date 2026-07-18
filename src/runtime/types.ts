// Runtime abstraction (V10.0) — deterministic stubs only.
// No network, SDK, process spawn, plugin discovery, or real task execution.

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
  requestedRuntime?: AgentRuntime;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
}>;

export const RUNTIME_RESULT_STATUSES = [
  "not_implemented",
  "unsupported",
] as const;

export type RuntimeResultStatus = (typeof RUNTIME_RESULT_STATUSES)[number];

/** Additive result shape reserved for a future real execution boundary. */
export type RuntimeResult = Readonly<{
  runtimeId: AgentRuntime | null;
  status: RuntimeResultStatus;
  startedAt: string;
  completedAt: string;
  diagnostics: readonly string[];
  output: unknown;
  metadata: RuntimeMetadata;
}>;

/**
 * Minimal stable runtime contract. `capabilities` is declarative only; a stub
 * advertises no executable capability and `execute` always returns a result.
 */
export type RuntimeAdapter = Readonly<{
  runtimeId: AgentRuntime;
  capabilities: readonly AgentCapability[];
  supports: (request: RuntimeRequest) => boolean;
  execute: (request: RuntimeRequest) => RuntimeResult;
}>;

export type RuntimeSelectionResult =
  | Readonly<{ outcome: "selected"; adapter: RuntimeAdapter }>
  | Readonly<{ outcome: "unsupported"; reason: string }>;

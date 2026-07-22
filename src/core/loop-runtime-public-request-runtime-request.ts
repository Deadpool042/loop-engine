import {
  AGENT_EFFORTS,
  type AgentEffort,
} from "../agents/types.js";
import type { LoopRuntimeRequestOptionsMapping } from "./loop-runtime-public-request-runtime-options.js";

export type LoopRuntimeRequestBinding = Readonly<{
  runtimeId: string;
  executable: string;
  arguments: readonly string[];
  cwd?: string;
}>;

export type LoopRuntimeConstructedRuntimeRequest = Readonly<{
  runtimeId: string;
  project: string;
  cycleId?: string;
  mode: "execute";
  policyId: string;
  profileId: string;
  effort: AgentEffort;
  limits: Readonly<{
    maxTokens: number;
    maxCostUsd: number;
    maxDurationMs: number;
    maxCalls: number;
    maxRepairs: number;
  }>;
  command: Readonly<{
    executable: string;
    arguments: readonly string[];
    cwd?: string;
  }>;
}>;

export type LoopRuntimeRequestConstructionFailureReason =
  | "invalid_options"
  | "invalid_binding"
  | "unsupported_dry_run";

export type LoopRuntimeRequestConstructionResult =
  | Readonly<{
      constructed: true;
      request: LoopRuntimeConstructedRuntimeRequest;
    }>
  | Readonly<{
      constructed: false;
      reason: LoopRuntimeRequestConstructionFailureReason;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isKnownEffort(effort: unknown): effort is AgentEffort {
  return AGENT_EFFORTS.includes(effort as AgentEffort);
}

function invalidOptions(): LoopRuntimeRequestConstructionResult {
  return Object.freeze({
    constructed: false,
    reason: "invalid_options" as const,
  });
}

function invalidBinding(): LoopRuntimeRequestConstructionResult {
  return Object.freeze({
    constructed: false,
    reason: "invalid_binding" as const,
  });
}

function unsupportedDryRun(): LoopRuntimeRequestConstructionResult {
  return Object.freeze({
    constructed: false,
    reason: "unsupported_dry_run" as const,
  });
}

function isValidLimits(
  limits: unknown,
): limits is LoopRuntimeConstructedRuntimeRequest["limits"] {
  return (
    isPlainObject(limits) &&
    isSafeNonNegativeInteger(limits.maxTokens) &&
    typeof limits.maxCostUsd === "number" &&
    Number.isFinite(limits.maxCostUsd) &&
    limits.maxCostUsd >= 0 &&
    isSafeNonNegativeInteger(limits.maxDurationMs) &&
    isSafeNonNegativeInteger(limits.maxCalls) &&
    isSafeNonNegativeInteger(limits.maxRepairs)
  );
}

function hasValidOptions(
  options: LoopRuntimeRequestOptionsMapping,
): options is LoopRuntimeRequestOptionsMapping {
  return (
    isPlainObject(options) &&
    isNonEmptyTrimmedString(options.project) &&
    (options.cycleId === undefined ||
      isNonEmptyTrimmedString(options.cycleId)) &&
    (options.mode === "dry-run" || options.mode === "execute") &&
    isNonEmptyTrimmedString(options.policyId) &&
    isNonEmptyTrimmedString(options.profileId) &&
    isKnownEffort(options.effort) &&
    isValidLimits(options.limits)
  );
}

function hasValidBinding(
  binding: LoopRuntimeRequestBinding,
): binding is LoopRuntimeRequestBinding {
  return (
    isPlainObject(binding) &&
    isNonEmptyTrimmedString(binding.runtimeId) &&
    isNonEmptyTrimmedString(binding.executable) &&
    Array.isArray(binding.arguments) &&
    binding.arguments.every((argument) => typeof argument === "string") &&
    (binding.cwd === undefined || isNonEmptyTrimmedString(binding.cwd))
  );
}

function copyLimits(
  limits: LoopRuntimeRequestOptionsMapping["limits"],
): LoopRuntimeConstructedRuntimeRequest["limits"] {
  return Object.freeze({
    maxTokens: limits.maxTokens,
    maxCostUsd: limits.maxCostUsd,
    maxDurationMs: limits.maxDurationMs,
    maxCalls: limits.maxCalls,
    maxRepairs: limits.maxRepairs,
  });
}

export function createLoopRuntimeRequestFromPublicOptions(
  options: LoopRuntimeRequestOptionsMapping,
  binding: LoopRuntimeRequestBinding,
): LoopRuntimeRequestConstructionResult {
  if (!hasValidOptions(options)) {
    return invalidOptions();
  }

  if (options.mode === "dry-run") {
    return unsupportedDryRun();
  }

  if (!hasValidBinding(binding)) {
    return invalidBinding();
  }

  return Object.freeze({
    constructed: true as const,
    request: Object.freeze({
      runtimeId: binding.runtimeId,
      project: options.project,
      mode: "execute" as const,
      policyId: options.policyId,
      profileId: options.profileId,
      effort: options.effort,
      ...(options.cycleId === undefined ? {} : { cycleId: options.cycleId }),
      limits: copyLimits(options.limits),
      command: Object.freeze({
        executable: binding.executable,
        arguments: Object.freeze([...binding.arguments]),
        ...(binding.cwd === undefined ? {} : { cwd: binding.cwd }),
      }),
    }),
  });
}

import { AGENT_EFFORTS, type AgentEffort } from "../agents/types.js";

export const LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION = 1 as const;

export type LoopRuntimePublicRequest = Readonly<{
  schemaVersion: typeof LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION;
  project: string;
  cycleId?: string;
  mode: "dry-run" | "execute";
  policyRef: string;
  profileRef: string;
  requestedMaxEffort: AgentEffort;
  budget: Readonly<{
    maxTokens: number;
    maxCostUsd: number;
    maxDurationMs: number;
    maxCalls: number;
    maxRepairs: number;
  }>;
}>;

export const LOOP_RUNTIME_PUBLIC_REQUEST_VALIDATION_FAILURE_REASONS = [
  "unsupported_schema",
  "invalid_project",
  "invalid_cycle_id",
  "invalid_mode",
  "invalid_policy_ref",
  "invalid_profile_ref",
  "invalid_effort",
  "invalid_budget",
] as const;

export type LoopRuntimePublicRequestValidationFailureReason =
  (typeof LOOP_RUNTIME_PUBLIC_REQUEST_VALIDATION_FAILURE_REASONS)[number];

export type LoopRuntimePublicRequestValidationResult =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reason: LoopRuntimePublicRequestValidationFailureReason;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isValidBudget(budget: unknown): budget is LoopRuntimePublicRequest["budget"] {
  return (
    isPlainObject(budget) &&
    isSafeNonNegativeInteger(budget.maxTokens) &&
    Number.isFinite(budget.maxCostUsd) &&
    typeof budget.maxCostUsd === "number" &&
    budget.maxCostUsd >= 0 &&
    isSafeNonNegativeInteger(budget.maxDurationMs) &&
    isSafeNonNegativeInteger(budget.maxCalls) &&
    isSafeNonNegativeInteger(budget.maxRepairs)
  );
}

function invalid(
  reason: LoopRuntimePublicRequestValidationFailureReason,
): LoopRuntimePublicRequestValidationResult {
  return Object.freeze({
    valid: false,
    reason,
  });
}

export function validateLoopRuntimePublicRequest(
  request: LoopRuntimePublicRequest,
): LoopRuntimePublicRequestValidationResult {
  if (
    !isPlainObject(request) ||
    request.schemaVersion !== LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION
  ) {
    return invalid("unsupported_schema");
  }

  if (!isTrimmedNonEmptyString(request.project)) {
    return invalid("invalid_project");
  }

  if (
    request.cycleId !== undefined &&
    !isTrimmedNonEmptyString(request.cycleId)
  ) {
    return invalid("invalid_cycle_id");
  }

  if (request.mode !== "dry-run" && request.mode !== "execute") {
    return invalid("invalid_mode");
  }

  if (!isTrimmedNonEmptyString(request.policyRef)) {
    return invalid("invalid_policy_ref");
  }

  if (!isTrimmedNonEmptyString(request.profileRef)) {
    return invalid("invalid_profile_ref");
  }

  if (!AGENT_EFFORTS.includes(request.requestedMaxEffort)) {
    return invalid("invalid_effort");
  }

  if (!isValidBudget(request.budget)) {
    return invalid("invalid_budget");
  }

  return Object.freeze({ valid: true });
}

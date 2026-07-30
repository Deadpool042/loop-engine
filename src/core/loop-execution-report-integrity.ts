import {
  AGENT_CAPABILITIES,
  AGENT_EFFORTS,
  AGENT_PERMISSIONS,
  AGENT_PROVIDERS,
  AGENT_RUNTIMES,
  type AgentBudget,
} from "../agents/types.js";
import {
  LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM,
  verifyLoopExecutionPlanEvidenceFingerprint,
  type LoopExecutionPlanFingerprint,
} from "../loop/execution-plan-evidence-fingerprint.js";
import type { LoopExecutionPlanEvidence } from "../loop/execution-plan-evidence.js";
import {
  LOOP_RUN_MODES,
  LOOP_RUN_STATUSES,
  type LoopRunResult,
} from "../loop/types.js";

export type LoopExecutionReportIntegrityFailureCode =
  | "invalid_report"
  | "evidence_pair_mismatch"
  | "invalid_execution_plan_evidence"
  | "invalid_execution_plan_fingerprint"
  | "execution_plan_fingerprint_mismatch";

export type LoopExecutionReportIntegrityResult =
  | Readonly<{ status: "accepted"; report: LoopRunResult }>
  | Readonly<{
      status: "rejected";
      code: LoopExecutionReportIntegrityFailureCode;
      details: readonly string[];
    }>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isMember<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function isBudgetValue(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isAgentBudget(value: unknown): value is AgentBudget {
  if (!isRecord(value)) return false;
  return (
    isBudgetValue(value.maxTokens) &&
    isBudgetValue(value.maxCostUsd) &&
    isBudgetValue(value.maxDurationMs) &&
    isBudgetValue(value.maxCalls) &&
    isBudgetValue(value.maxRepairs)
  );
}

function isExecutionPlanEvidence(
  value: unknown,
): value is LoopExecutionPlanEvidence {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.policy)
  ) {
    return false;
  }
  return (
    isMember(AGENT_PROVIDERS, value.provider) &&
    isMember(AGENT_RUNTIMES, value.runtime) &&
    isNonEmptyString(value.profileId) &&
    isNonEmptyString(value.model) &&
    isMember(AGENT_EFFORTS, value.effort) &&
    isAgentBudget(value.budget) &&
    isNonEmptyString(value.policy.id) &&
    (value.policy.mode === "execute" || value.policy.mode === "commit") &&
    Array.isArray(value.policy.requiredCapabilities) &&
    value.policy.requiredCapabilities.every((item) =>
      isMember(AGENT_CAPABILITIES, item),
    ) &&
    Array.isArray(value.policy.requiredPermissions) &&
    value.policy.requiredPermissions.every((item) =>
      isMember(AGENT_PERMISSIONS, item),
    ) &&
    isStringArray(value.policy.rationale)
  );
}

function isExecutionPlanFingerprint(
  value: unknown,
): value is LoopExecutionPlanFingerprint {
  return (
    isRecord(value) &&
    value.algorithm === LOOP_EXECUTION_PLAN_FINGERPRINT_ALGORITHM &&
    typeof value.value === "string" &&
    /^[a-f0-9]{64}$/.test(value.value)
  );
}

function isExecutionReportEnvelope(value: UnknownRecord): boolean {
  return (
    value.schemaVersion === 1 &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.project) &&
    isMember(LOOP_RUN_MODES, value.mode) &&
    isMember(LOOP_RUN_STATUSES, value.status) &&
    isNonEmptyString(value.startedAt) &&
    (value.completedAt === null || isNonEmptyString(value.completedAt)) &&
    Array.isArray(value.steps) &&
    Array.isArray(value.modifiedFiles) &&
    value.modifiedFiles.every(isNonEmptyString) &&
    value.publication === null
  );
}

function rejected(
  code: LoopExecutionReportIntegrityFailureCode,
  ...details: string[]
): LoopExecutionReportIntegrityResult {
  return Object.freeze({
    status: "rejected" as const,
    code,
    details: Object.freeze(details),
  });
}

/**
 * Validates an untrusted execution report before it crosses a consumer boundary.
 * Evidence and fingerprint are an atomic pair: both absent is valid, but partial,
 * malformed or cryptographically inconsistent pairs fail closed.
 */
export function verifyLoopExecutionReportIntegrity(
  value: unknown,
): LoopExecutionReportIntegrityResult {
  if (!isRecord(value) || !isExecutionReportEnvelope(value)) {
    return rejected(
      "invalid_report",
      "Expected a structurally valid schemaVersion 1 execution report.",
    );
  }

  const evidence = value.executionPlanEvidence;
  const fingerprint = value.executionPlanFingerprint;
  const evidenceAbsent = evidence === null || evidence === undefined;
  const fingerprintAbsent = fingerprint === null || fingerprint === undefined;

  if (evidenceAbsent !== fingerprintAbsent) {
    return rejected(
      "evidence_pair_mismatch",
      "Execution-plan evidence and fingerprint must be both present or both absent.",
    );
  }

  if (evidenceAbsent) {
    return Object.freeze({
      status: "accepted" as const,
      report: value as unknown as LoopRunResult,
    });
  }
  if (!isExecutionPlanEvidence(evidence)) {
    return rejected(
      "invalid_execution_plan_evidence",
      "Execution-plan evidence does not match schema version 1.",
    );
  }
  if (!isExecutionPlanFingerprint(fingerprint)) {
    return rejected(
      "invalid_execution_plan_fingerprint",
      "Execution-plan fingerprint must be a SHA-256 hex digest.",
    );
  }
  if (!verifyLoopExecutionPlanEvidenceFingerprint(evidence, fingerprint)) {
    return rejected(
      "execution_plan_fingerprint_mismatch",
      "Execution-plan evidence does not match its declared fingerprint.",
    );
  }

  return Object.freeze({
    status: "accepted" as const,
    report: value as unknown as LoopRunResult,
  });
}

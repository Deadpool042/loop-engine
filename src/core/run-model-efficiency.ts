import { AGENT_EFFORTS, type AgentEffort } from "../agents/types.js";
import { findOutOfScopeFiles } from "../loop/file-scope.js";
import type {
  LoopProviderFailoverAttemptEvidence,
} from "../loop/provider-failover.js";
import type {
  LoopRunMode,
  LoopRunResult,
  LoopRunStatus,
} from "../loop/types.js";
import {
  generateRunHistoryReport,
  type LoopRunHistoryReport,
} from "./reports.js";

const EXECUTION_MODES: ReadonlySet<LoopRunMode> = new Set([
  "execute",
  "commit",
  "publish",
]);

type TerminalRunStatus = "completed" | "failed" | "blocked" | "cancelled";

export type LoopRunModelObservation = Readonly<{
  runId: string;
  completedAt: string | null;
  mode: LoopRunMode;
  runStatus: LoopRunStatus;
  provider: string;
  runtime: string;
  profileId: string;
  model: string;
  effort: AgentEffort | null;
  selectedAfterFailover: boolean;
  providerAttempt: Readonly<{
    attempt: number;
    status: "completed" | "failed";
    failureCode: string | null;
    recoverable: boolean;
  }> | null;
  durationMs: number | null;
  validation: Readonly<{
    status: "passed" | "failed";
    attempts: number;
    repairAttempts: number;
    exitCode: number;
  }> | null;
  modifiedFileCount: number;
  outOfScopeFileCount: number | null;
}>;

export type LoopRunModelAggregate = Readonly<{
  provider: string;
  runtime: string;
  model: string;
  profileIds: readonly string[];
  terminalRuns: number;
  outcomes: Readonly<Record<TerminalRunStatus, number>>;
  validation: Readonly<{
    observedRuns: number;
    passedRuns: number;
    failedRuns: number;
    totalRepairAttempts: number;
  }>;
  duration: Readonly<{
    observedRuns: number;
    totalMs: number;
    minMs: number | null;
    maxMs: number | null;
  }>;
  files: Readonly<{
    modifiedTotal: number;
    outOfScopeObservedRuns: number;
    outOfScopeTotal: number;
  }>;
}>;

export type LoopRunProviderAttemptAggregate = Readonly<{
  provider: string;
  runtime: string;
  model: string;
  profileIds: readonly string[];
  attempts: number;
  completed: number;
  failed: number;
  recoverableFailures: number;
  failureCodes: readonly Readonly<{ code: string; count: number }>[];
}>;

export type LoopRunModelEfficiencyReport = Readonly<{
  schemaVersion: 1;
  project: string;
  limit: number;
  historyEntries: number;
  executionRuns: number;
  observedRuns: number;
  unattributedExecutionRuns: number;
  corruptedLines: number;
  observations: readonly LoopRunModelObservation[];
  models: readonly LoopRunModelAggregate[];
  providerAttempts: readonly LoopRunProviderAttemptAggregate[];
  telemetry: Readonly<{
    tokens: "unavailable";
    costUsd: "unavailable";
    quota: "unavailable";
    reason: "no_reliable_provider_usage_or_quota_source";
  }>;
  error?: "invalid_project_identity";
}>;

function isTerminalRunStatus(status: LoopRunStatus): status is TerminalRunStatus {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "blocked" ||
    status === "cancelled"
  );
}

function durationMs(result: LoopRunResult): number | null {
  if (result.completedAt === null) return null;
  const started = Date.parse(result.startedAt);
  const completed = Date.parse(result.completedAt);
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(completed) ||
    completed < started
  ) {
    return null;
  }
  return completed - started;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProviderAttemptEvidence(
  value: unknown,
): value is LoopProviderFailoverAttemptEvidence {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.attempt) &&
    typeof value.attempt === "number" &&
    value.attempt > 0 &&
    nonEmptyString(value.provider) &&
    nonEmptyString(value.runtime) &&
    nonEmptyString(value.profileId) &&
    nonEmptyString(value.model) &&
    (value.status === "completed" || value.status === "failed") &&
    (value.failureCode === null || typeof value.failureCode === "string") &&
    typeof value.recoverable === "boolean"
  );
}

function providerAttempts(
  result: LoopRunResult,
): readonly LoopProviderFailoverAttemptEvidence[] {
  const evidence = result.providerFailoverEvidence as unknown;
  if (!isRecord(evidence) || !Array.isArray(evidence.attempts)) return [];
  return Object.freeze(evidence.attempts.filter(isProviderAttemptEvidence));
}

function selectedProvider(result: LoopRunResult): string | null {
  const evidence = result.providerFailoverEvidence as unknown;
  if (!isRecord(evidence)) return null;
  return nonEmptyString(evidence.selectedProvider)
    ? evidence.selectedProvider
    : null;
}

function terminalProviderAttempt(
  result: LoopRunResult,
): LoopProviderFailoverAttemptEvidence | null {
  const attempts = providerAttempts(result);
  if (attempts.length === 0) return null;
  const selected = selectedProvider(result);

  if (selected !== null) {
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
      const attempt = attempts[index];
      if (
        attempt &&
        attempt.provider === selected &&
        attempt.status === "completed"
      ) {
        return attempt;
      }
    }
  }

  return attempts[attempts.length - 1] ?? null;
}

type ExecutionPlanIdentity = Readonly<{
  provider: string;
  runtime: string;
  profileId: string;
  model: string;
  effort: AgentEffort;
}>;

function executionPlanIdentity(
  result: LoopRunResult,
): ExecutionPlanIdentity | null {
  const plan = result.executionPlanEvidence as unknown;
  if (!isRecord(plan)) return null;
  if (
    !nonEmptyString(plan.provider) ||
    !nonEmptyString(plan.runtime) ||
    !nonEmptyString(plan.profileId) ||
    !nonEmptyString(plan.model) ||
    typeof plan.effort !== "string" ||
    !(AGENT_EFFORTS as readonly string[]).includes(plan.effort)
  ) {
    return null;
  }
  return Object.freeze({
    provider: plan.provider,
    runtime: plan.runtime,
    profileId: plan.profileId,
    model: plan.model,
    effort: plan.effort as AgentEffort,
  });
}

function observationIdentity(
  result: LoopRunResult,
): Readonly<{
  provider: string;
  runtime: string;
  profileId: string;
  model: string;
  effort: AgentEffort | null;
  attempt: LoopProviderFailoverAttemptEvidence | null;
}> | null {
  const attempt = terminalProviderAttempt(result);
  const plan = executionPlanIdentity(result);

  if (attempt !== null) {
    const effort =
      plan !== null &&
      plan.provider === attempt.provider &&
      plan.runtime === attempt.runtime &&
      plan.profileId === attempt.profileId &&
      plan.model === attempt.model
        ? plan.effort
        : null;
    return Object.freeze({
      provider: attempt.provider,
      runtime: attempt.runtime,
      profileId: attempt.profileId,
      model: attempt.model,
      effort,
      attempt,
    });
  }

  if (plan === null) return null;
  return Object.freeze({
    ...plan,
    attempt: null,
  });
}

function modifiedFiles(result: LoopRunResult): readonly string[] {
  const value = result.modifiedFiles as unknown;
  if (!Array.isArray(value)) return [];
  return Object.freeze(
    value.filter((path): path is string => nonEmptyString(path)),
  );
}

function outOfScopeFileCount(result: LoopRunResult): number | null {
  const scope = result.writableFileScope as unknown;
  if (scope === undefined || scope === null) return null;
  if (!Array.isArray(scope) || !scope.every(nonEmptyString)) return null;
  return findOutOfScopeFiles(modifiedFiles(result), scope).length;
}

function projectedValidation(
  result: LoopRunResult,
): LoopRunModelObservation["validation"] {
  const validation = result.validation as unknown;
  if (!isRecord(validation)) return null;
  if (
    (validation.status !== "passed" && validation.status !== "failed") ||
    !Number.isInteger(validation.attempts) ||
    !Number.isInteger(validation.repairAttempts) ||
    !Number.isInteger(validation.exitCode)
  ) {
    return null;
  }
  return Object.freeze({
    status: validation.status,
    attempts: validation.attempts as number,
    repairAttempts: validation.repairAttempts as number,
    exitCode: validation.exitCode as number,
  });
}

export function projectRunModelObservation(
  result: LoopRunResult,
): LoopRunModelObservation | null {
  if (!EXECUTION_MODES.has(result.mode)) return null;
  const identity = observationIdentity(result);
  if (identity === null) return null;

  const validation = projectedValidation(result);
  const observedModifiedFiles = modifiedFiles(result);

  return Object.freeze({
    runId: result.runId,
    completedAt: result.completedAt,
    mode: result.mode,
    runStatus: result.status,
    provider: identity.provider,
    runtime: identity.runtime,
    profileId: identity.profileId,
    model: identity.model,
    effort: identity.effort,
    selectedAfterFailover: (identity.attempt?.attempt ?? 1) > 1,
    providerAttempt:
      identity.attempt === null
        ? null
        : Object.freeze({
            attempt: identity.attempt.attempt,
            status: identity.attempt.status,
            failureCode: identity.attempt.failureCode,
            recoverable: identity.attempt.recoverable,
          }),
    durationMs: durationMs(result),
    validation,
    modifiedFileCount: observedModifiedFiles.length,
    outOfScopeFileCount: outOfScopeFileCount(result),
  });
}

type MutableModelAggregate = {
  provider: string;
  runtime: string;
  model: string;
  profileIds: Set<string>;
  terminalRuns: number;
  outcomes: Record<TerminalRunStatus, number>;
  validationObservedRuns: number;
  validationPassedRuns: number;
  validationFailedRuns: number;
  totalRepairAttempts: number;
  durationObservedRuns: number;
  durationTotalMs: number;
  durationMinMs: number | null;
  durationMaxMs: number | null;
  modifiedTotal: number;
  outOfScopeObservedRuns: number;
  outOfScopeTotal: number;
};

function modelKey(provider: string, runtime: string, model: string): string {
  return `${provider}\u0000${runtime}\u0000${model}`;
}

function aggregateModels(
  observations: readonly LoopRunModelObservation[],
): readonly LoopRunModelAggregate[] {
  const groups = new Map<string, MutableModelAggregate>();

  for (const observation of observations) {
    const key = modelKey(
      observation.provider,
      observation.runtime,
      observation.model,
    );
    let group = groups.get(key);
    if (!group) {
      group = {
        provider: observation.provider,
        runtime: observation.runtime,
        model: observation.model,
        profileIds: new Set<string>(),
        terminalRuns: 0,
        outcomes: { completed: 0, failed: 0, blocked: 0, cancelled: 0 },
        validationObservedRuns: 0,
        validationPassedRuns: 0,
        validationFailedRuns: 0,
        totalRepairAttempts: 0,
        durationObservedRuns: 0,
        durationTotalMs: 0,
        durationMinMs: null,
        durationMaxMs: null,
        modifiedTotal: 0,
        outOfScopeObservedRuns: 0,
        outOfScopeTotal: 0,
      };
      groups.set(key, group);
    }

    group.profileIds.add(observation.profileId);
    group.terminalRuns += 1;
    if (isTerminalRunStatus(observation.runStatus)) {
      group.outcomes[observation.runStatus] += 1;
    }

    if (observation.validation !== null) {
      group.validationObservedRuns += 1;
      group.totalRepairAttempts += observation.validation.repairAttempts;
      if (observation.validation.status === "passed") {
        group.validationPassedRuns += 1;
      } else {
        group.validationFailedRuns += 1;
      }
    }

    if (observation.durationMs !== null) {
      group.durationObservedRuns += 1;
      group.durationTotalMs += observation.durationMs;
      group.durationMinMs =
        group.durationMinMs === null
          ? observation.durationMs
          : Math.min(group.durationMinMs, observation.durationMs);
      group.durationMaxMs =
        group.durationMaxMs === null
          ? observation.durationMs
          : Math.max(group.durationMaxMs, observation.durationMs);
    }

    group.modifiedTotal += observation.modifiedFileCount;
    if (observation.outOfScopeFileCount !== null) {
      group.outOfScopeObservedRuns += 1;
      group.outOfScopeTotal += observation.outOfScopeFileCount;
    }
  }

  return Object.freeze(
    [...groups.values()]
      .sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.runtime.localeCompare(right.runtime) ||
          left.model.localeCompare(right.model),
      )
      .map((group) =>
        Object.freeze({
          provider: group.provider,
          runtime: group.runtime,
          model: group.model,
          profileIds: Object.freeze([...group.profileIds].sort()),
          terminalRuns: group.terminalRuns,
          outcomes: Object.freeze({ ...group.outcomes }),
          validation: Object.freeze({
            observedRuns: group.validationObservedRuns,
            passedRuns: group.validationPassedRuns,
            failedRuns: group.validationFailedRuns,
            totalRepairAttempts: group.totalRepairAttempts,
          }),
          duration: Object.freeze({
            observedRuns: group.durationObservedRuns,
            totalMs: group.durationTotalMs,
            minMs: group.durationMinMs,
            maxMs: group.durationMaxMs,
          }),
          files: Object.freeze({
            modifiedTotal: group.modifiedTotal,
            outOfScopeObservedRuns: group.outOfScopeObservedRuns,
            outOfScopeTotal: group.outOfScopeTotal,
          }),
        }),
      ),
  );
}

type MutableAttemptAggregate = {
  provider: string;
  runtime: string;
  model: string;
  profileIds: Set<string>;
  attempts: number;
  completed: number;
  failed: number;
  recoverableFailures: number;
  failureCodes: Map<string, number>;
};

function aggregateProviderAttempts(
  entries: readonly LoopRunResult[],
): readonly LoopRunProviderAttemptAggregate[] {
  const groups = new Map<string, MutableAttemptAggregate>();

  for (const entry of entries) {
    if (!EXECUTION_MODES.has(entry.mode)) continue;
    const attempts = providerAttempts(entry);
    for (const attempt of attempts) {
      const key = modelKey(attempt.provider, attempt.runtime, attempt.model);
      let group = groups.get(key);
      if (!group) {
        group = {
          provider: attempt.provider,
          runtime: attempt.runtime,
          model: attempt.model,
          profileIds: new Set<string>(),
          attempts: 0,
          completed: 0,
          failed: 0,
          recoverableFailures: 0,
          failureCodes: new Map<string, number>(),
        };
        groups.set(key, group);
      }

      group.profileIds.add(attempt.profileId);
      group.attempts += 1;
      if (attempt.status === "completed") {
        group.completed += 1;
      } else {
        group.failed += 1;
        if (attempt.recoverable) group.recoverableFailures += 1;
        if (attempt.failureCode !== null) {
          group.failureCodes.set(
            attempt.failureCode,
            (group.failureCodes.get(attempt.failureCode) ?? 0) + 1,
          );
        }
      }
    }
  }

  return Object.freeze(
    [...groups.values()]
      .sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.runtime.localeCompare(right.runtime) ||
          left.model.localeCompare(right.model),
      )
      .map((group) =>
        Object.freeze({
          provider: group.provider,
          runtime: group.runtime,
          model: group.model,
          profileIds: Object.freeze([...group.profileIds].sort()),
          attempts: group.attempts,
          completed: group.completed,
          failed: group.failed,
          recoverableFailures: group.recoverableFailures,
          failureCodes: Object.freeze(
            [...group.failureCodes.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([code, count]) => Object.freeze({ code, count })),
          ),
        }),
      ),
  );
}

export function buildRunModelEfficiencyReport(
  history: LoopRunHistoryReport,
): LoopRunModelEfficiencyReport {
  const executionEntries = history.entries.filter((entry) =>
    EXECUTION_MODES.has(entry.mode),
  );
  const observations = Object.freeze(
    executionEntries
      .map(projectRunModelObservation)
      .filter(
        (observation): observation is LoopRunModelObservation =>
          observation !== null,
      ),
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    project: history.project,
    limit: history.limit,
    historyEntries: history.entries.length,
    executionRuns: executionEntries.length,
    observedRuns: observations.length,
    unattributedExecutionRuns: executionEntries.length - observations.length,
    corruptedLines: history.corruptedLines,
    observations,
    models: aggregateModels(observations),
    providerAttempts: aggregateProviderAttempts(executionEntries),
    telemetry: Object.freeze({
      tokens: "unavailable" as const,
      costUsd: "unavailable" as const,
      quota: "unavailable" as const,
      reason: "no_reliable_provider_usage_or_quota_source" as const,
    }),
    ...(history.error === undefined ? {} : { error: history.error }),
  });
}

export function generateRunModelEfficiencyReport(
  projectName: string,
  options: Readonly<{ limit?: number }> = {},
): LoopRunModelEfficiencyReport {
  return buildRunModelEfficiencyReport(
    generateRunHistoryReport(projectName, options),
  );
}

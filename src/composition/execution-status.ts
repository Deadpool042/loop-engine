import { resolve } from "node:path";

import { generateRunHistoryReport } from "../core/index.js";
import type { DurableExecutionRecord } from "../loop/durable-execution.js";
import { readFileDurableExecutionRecords } from "../loop/file-durable-execution-store.js";

const DURABLE_EXECUTION_DIRECTORY = ".loop-engine/durable-executions";
const HISTORY_LIMIT = 10;

type ParsedDurableIdentity = Readonly<{
  candidateId: string | null;
  expectedGitHead: string | null;
}>;

type ExecutorSnapshot = Readonly<{
  profileId: string;
  provider: string;
  runtime: string;
  model: string;
  effort: string;
  fundingMode: string | null;
  attempt: number;
  maxAttempts: number;
}>;

function parseIdentity(idempotencyKey: string): ParsedDurableIdentity {
  const match = /^auto-subscription:[^:]+:([^:]+):([a-f0-9]{40})$/i.exec(
    idempotencyKey,
  );
  return Object.freeze({
    candidateId: match?.[1] ?? null,
    expectedGitHead: match?.[2]?.toLowerCase() ?? null,
  });
}

function terminalExecutor(record: DurableExecutionRecord): ExecutorSnapshot | null {
  const result = record.result;
  const selection = result?.agentPolicy?.selection;
  if (!selection || selection.outcome !== "selected") return null;
  const profile = selection.profile;
  const escalations = result.modelEscalationEvidence?.attempts.length ?? 0;
  return Object.freeze({
    profileId: profile.id,
    provider: profile.provider,
    runtime: profile.runtime,
    model: profile.model,
    effort: profile.effort,
    fundingMode: profile.fundingMode ?? null,
    attempt: escalations + 1,
    maxAttempts: result.modelEscalationEvidence?.maxAttempts ?? escalations + 1,
  });
}

function executorFor(record: DurableExecutionRecord): ExecutorSnapshot | null {
  if (record.status === "running" && record.progress?.executor) {
    return Object.freeze({ ...record.progress.executor });
  }
  return terminalExecutor(record);
}

function finiteDurationMs(startedAt: string, completedAt: string | null): number | null {
  if (!completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  const duration = end - start;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

function expectedDurationMs(project: string): number | null {
  const history = generateRunHistoryReport(project, {
    limit: HISTORY_LIMIT,
  });
  return median(
    history.entries
      .map((entry) => finiteDurationMs(entry.startedAt, entry.completedAt))
      .filter((value): value is number => value !== null && value > 0),
  );
}

function progressRange(status: string): readonly [number, number] {
  switch (status) {
    case "planning":
      return [2, 8];
    case "ready":
      return [10, 15];
    case "executing":
      return [20, 75];
    case "validating":
      return [80, 94];
    case "repairing":
      return [85, 97];
    case "completed":
    case "failed":
    case "cancelled":
    case "blocked":
      return [100, 100];
    default:
      return [1, 5];
  }
}

function estimatedProgress(
  record: DurableExecutionRecord,
  nowMs: number,
  expectedMs: number | null,
) {
  const terminal = record.status !== "running";
  const started = Date.parse(record.createdAt);
  const terminalAt = Date.parse(record.result?.completedAt ?? record.updatedAt);
  const observedNowMs =
    terminal && Number.isFinite(terminalAt) ? terminalAt : nowMs;
  const elapsedMs =
    Number.isFinite(started) && observedNowMs >= started
      ? Math.max(0, observedNowMs - started)
      : 0;
  const status = terminal
    ? record.status
    : record.progress?.status ?? "starting";
  const step = terminal
    ? record.result?.steps.at(-1)?.name ?? record.status
    : record.progress?.step ?? "starting";

  if (terminal) {
    return Object.freeze({
      status,
      step,
      percent: 100,
      percentSource: "terminal" as const,
      elapsedMs,
      expectedDurationMs: expectedMs,
      remainingMs: 0,
      etaState: "terminal" as const,
    });
  }

  const [floor, ceiling] = progressRange(status);
  const ratio =
    expectedMs !== null && expectedMs > 0 ? elapsedMs / expectedMs : null;
  const byTime = ratio === null ? floor : Math.round(ratio * 100);
  const percent = Math.max(floor, Math.min(ceiling, byTime));
  const remainingMs =
    expectedMs !== null && elapsedMs < expectedMs
      ? Math.max(0, expectedMs - elapsedMs)
      : null;

  return Object.freeze({
    status,
    step,
    percent,
    percentSource: "estimate" as const,
    elapsedMs,
    expectedDurationMs: expectedMs,
    remainingMs,
    etaState:
      expectedMs === null
        ? ("unavailable" as const)
        : elapsedMs >= expectedMs
          ? ("over_estimate" as const)
          : ("estimated" as const),
  });
}

function terminalSummary(record: DurableExecutionRecord) {
  if (record.status === "running") return null;
  const result = record.result;
  return Object.freeze({
    runId: result?.runId ?? null,
    status: record.status,
    failure:
      result?.failure ?? record.failure ?? null,
    validation: result?.validation ?? null,
    modifiedFiles: Object.freeze([...(result?.modifiedFiles ?? [])]),
    publication: result?.publication ?? null,
    modelEscalationEvidence: result?.modelEscalationEvidence ?? null,
    providerFailoverEvidence: result?.providerFailoverEvidence ?? null,
  });
}

export async function buildExecutionStatusReport(
  project: string,
  options: Readonly<{
    directory?: string;
    nowMs?: number;
    expectedDurationMs?: number | null;
  }> = {},
) {
  const records = await readFileDurableExecutionRecords(
    resolve(options.directory ?? DURABLE_EXECUTION_DIRECTORY),
    project,
  );
  const record = records[0] ?? null;

  if (record === null) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project,
      execution: null,
      telemetry: Object.freeze({
        tokens: Object.freeze({
          status: "unavailable" as const,
          reason: "provider_usage_not_recorded",
        }),
        costUsd: Object.freeze({
          status: "unavailable" as const,
          reason: "provider_usage_not_recorded",
        }),
      }),
    });
  }

  const identity = parseIdentity(record.idempotencyKey);
  const expectedMs =
    options.expectedDurationMs === undefined
      ? expectedDurationMs(project)
      : options.expectedDurationMs;
  const progress = estimatedProgress(
    record,
    options.nowMs ?? Date.now(),
    expectedMs,
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    project,
    execution: Object.freeze({
      idempotencyKey: record.idempotencyKey,
      candidateId: identity.candidateId,
      expectedGitHead: identity.expectedGitHead,
      state: record.status,
      attempt: record.attempt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      runId: record.progress?.runId ?? record.result?.runId ?? null,
      progress,
      executor: executorFor(record),
      terminal: terminalSummary(record),
    }),
    telemetry: Object.freeze({
      tokens: Object.freeze({
        status: "unavailable" as const,
        reason: "provider_usage_not_recorded",
      }),
      costUsd: Object.freeze({
        status: "unavailable" as const,
        reason: "provider_usage_not_recorded",
      }),
    }),
  });
}

import {
  parseExecutionResultDetail,
  type ExecutionResultDetail,
} from "./execution-result-contract.js";

export type RunHistoryStatus = "completed" | "blocked" | "failed" | "cancelled";
export type RunHistoryMode = "plan" | "execute" | "commit" | "publish";

export type RunHistoryEntry = Readonly<{
  runId: string;
  mode: RunHistoryMode;
  status: RunHistoryStatus;
  startedAt: string;
  completedAt: string | null;
  candidateId: string | null;
  executionResult: ExecutionResultDetail | null;
}>;

export type RunHistoryDetail = Readonly<{
  project: string;
  limit: number;
  corruptedLines: number;
  entries: readonly RunHistoryEntry[];
}>;

const MODES: ReadonlySet<string> = new Set([
  "plan",
  "execute",
  "commit",
  "publish",
]);
const STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCandidateId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    (value.id !== undefined && typeof value.id !== "string")
  ) {
    return undefined;
  }
  return typeof value.id === "string" ? value.id : null;
}

function parseEntry(value: unknown, project: string): RunHistoryEntry | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.runId !== "string" ||
    value.project !== project ||
    typeof value.mode !== "string" ||
    !MODES.has(value.mode) ||
    typeof value.status !== "string" ||
    !STATUSES.has(value.status) ||
    typeof value.startedAt !== "string" ||
    (value.completedAt !== null && typeof value.completedAt !== "string")
  ) {
    return null;
  }

  const candidateId = parseCandidateId(value.candidate);
  if (candidateId === undefined) return null;

  const executionResult =
    value.mode === "execute" && value.status !== "cancelled"
      ? parseExecutionResultDetail(value)
      : null;
  if (
    value.mode === "execute" &&
    value.status !== "cancelled" &&
    executionResult === null
  ) {
    return null;
  }

  return Object.freeze({
    runId: value.runId,
    mode: value.mode as RunHistoryMode,
    status: value.status as RunHistoryStatus,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    candidateId,
    executionResult,
  });
}

/**
 * Parses the public, bounded `loop runs <project> --json` report. A malformed
 * report or entry is rejected entirely; JSONL line recovery remains Core-owned
 * and is represented only by `corruptedLines`.
 */
export function parseRunHistoryDetail(value: unknown): RunHistoryDetail | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.project !== "string" ||
    typeof value.limit !== "number" ||
    !Number.isInteger(value.limit) ||
    value.limit <= 0 ||
    typeof value.corruptedLines !== "number" ||
    !Number.isInteger(value.corruptedLines) ||
    value.corruptedLines < 0 ||
    !Array.isArray(value.entries)
  ) {
    return null;
  }

  const project = value.project;
  const entries = value.entries.map((entry) => parseEntry(entry, project));
  if (entries.some((entry) => entry === null)) return null;

  return Object.freeze({
    project,
    limit: value.limit,
    corruptedLines: value.corruptedLines,
    entries: Object.freeze(entries as RunHistoryEntry[]),
  });
}

const STATUS_LABELS: Readonly<Record<RunHistoryStatus, string>> = {
  completed: "Terminé",
  blocked: "Bloqué",
  failed: "Échec",
  cancelled: "Annulé",
};

export function formatRunHistoryStatus(status: RunHistoryStatus): string {
  return STATUS_LABELS[status];
}

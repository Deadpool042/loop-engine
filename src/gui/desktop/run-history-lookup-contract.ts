import {
  parseRunHistoryEntry,
  type RunHistoryEntry,
} from "./run-history-contract.js";

export type RunHistoryLookupFailureCode =
  | "not_found"
  | "duplicate_run_id"
  | "invalid_project_identity"
  | "read_failed";

export type RunHistoryLookupResponse =
  | Readonly<{
      found: true;
      project: string;
      runId: string;
      corruptedLines: number;
      entry: RunHistoryEntry;
    }>
  | Readonly<{
      found: false;
      project: string;
      runId: string;
      corruptedLines: number;
      code: RunHistoryLookupFailureCode;
    }>;

const FAILURE_CODES: ReadonlySet<string> = new Set([
  "not_found",
  "duplicate_run_id",
  "invalid_project_identity",
  "read_failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRunHistoryLookupResponse(
  value: unknown,
): RunHistoryLookupResponse | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.project !== "string" ||
    value.project.length === 0 ||
    typeof value.runId !== "string" ||
    value.runId.length === 0 ||
    typeof value.found !== "boolean" ||
    typeof value.corruptedLines !== "number" ||
    !Number.isInteger(value.corruptedLines) ||
    value.corruptedLines < 0
  ) {
    return null;
  }

  if (!value.found) {
    if (typeof value.code !== "string" || !FAILURE_CODES.has(value.code)) {
      return null;
    }
    return Object.freeze({
      found: false,
      project: value.project,
      runId: value.runId,
      corruptedLines: value.corruptedLines,
      code: value.code as RunHistoryLookupFailureCode,
    });
  }

  const entry = parseRunHistoryEntry(value.entry, value.project);
  if (entry === null || entry.runId !== value.runId) return null;
  return Object.freeze({
    found: true,
    project: value.project,
    runId: value.runId,
    corruptedLines: value.corruptedLines,
    entry,
  });
}

const FAILURE_MESSAGES: Readonly<Record<RunHistoryLookupFailureCode, string>> = {
  not_found: "Aucun run enregistré avec cet identifiant.",
  duplicate_run_id: "Cet identifiant de run est ambigu dans l’historique.",
  invalid_project_identity: "L’identité du projet ne permet pas de lire l’historique.",
  read_failed: "Le journal Run History n’a pas pu être lu.",
};

export function formatRunHistoryLookupFailure(
  code: RunHistoryLookupFailureCode,
): string {
  return FAILURE_MESSAGES[code];
}

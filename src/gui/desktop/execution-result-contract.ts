export type ExecutionResultStatus = "completed" | "blocked" | "failed";

export type ExecutionResultDetail = Readonly<{
  status: ExecutionResultStatus;
  modifiedFiles: readonly string[];
  validation: Readonly<{
    status: "passed" | "failed";
    attempts: number;
    repairAttempts: number;
    failedCommand: string | null;
    exitCode: number;
  }> | null;
  patchExport: Readonly<{
    path: string;
    sha256: string;
    fileCount: number;
  }> | null;
  failure: Readonly<{
    code: string;
    message: string;
    details: readonly string[];
  }> | null;
}>;

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "blocked",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function parseValidation(
  value: unknown,
): ExecutionResultDetail["validation"] | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    (value.status !== "passed" && value.status !== "failed") ||
    typeof value.attempts !== "number" ||
    typeof value.repairAttempts !== "number" ||
    typeof value.exitCode !== "number" ||
    (value.failedCommand !== null && typeof value.failedCommand !== "string")
  ) {
    return undefined;
  }

  return Object.freeze({
    status: value.status,
    attempts: value.attempts,
    repairAttempts: value.repairAttempts,
    failedCommand: value.failedCommand,
    exitCode: value.exitCode,
  });
}

function parsePatchExport(
  value: unknown,
): ExecutionResultDetail["patchExport"] | undefined {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.sha256 !== "string" ||
    typeof value.fileCount !== "number"
  ) {
    return undefined;
  }

  return Object.freeze({
    path: value.path,
    sha256: value.sha256,
    fileCount: value.fileCount,
  });
}

function parseFailure(
  value: unknown,
): ExecutionResultDetail["failure"] | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.message !== "string" ||
    !isStringArray(value.details)
  ) {
    return undefined;
  }

  return Object.freeze({
    code: value.code,
    message: value.message,
    details: Object.freeze([...value.details]),
  });
}

const STATUS_LABELS: Readonly<Record<ExecutionResultStatus, string>> = {
  completed: "Terminé",
  blocked: "Bloqué",
  failed: "Échec",
};

export function formatExecutionResultStatus(
  status: ExecutionResultStatus,
): string {
  return STATUS_LABELS[status];
}

export function formatExecutionValidationStatus(
  status: "passed" | "failed",
): string {
  return status === "passed" ? "Réussie" : "Échouée";
}

/**
 * Parses the terminal projection of a `LoopRunResult` used by the cockpit
 * result review. Fail-closed: any unrecognized shape, including a
 * completed/failure mismatch, returns null rather than a partial result.
 */
export function parseExecutionResultDetail(
  value: unknown,
): ExecutionResultDetail | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.status !== "string" ||
    !TERMINAL_STATUSES.has(value.status) ||
    !isStringArray(value.modifiedFiles)
  ) {
    return null;
  }

  const validation = parseValidation(value.validation);
  const patchExport = parsePatchExport(value.patchExport);
  const failure = parseFailure(value.failure);
  if (
    validation === undefined ||
    patchExport === undefined ||
    failure === undefined
  ) {
    return null;
  }

  const status = value.status as ExecutionResultStatus;
  const hasFailure = failure !== null;
  if (status === "completed" ? hasFailure : !hasFailure) return null;

  return Object.freeze({
    status,
    modifiedFiles: Object.freeze([...value.modifiedFiles]),
    validation,
    patchExport,
    failure,
  });
}

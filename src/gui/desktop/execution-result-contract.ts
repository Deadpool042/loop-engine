export type ExecutionResultStatus = "completed" | "blocked" | "failed";
export type ExecutionResultMode = "execute" | "publish";

export type ExecutionResultDetail = Readonly<{
  status: ExecutionResultStatus;
  mode: ExecutionResultMode;
  runId: string | null;
  project: string | null;
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
    baseSha: string;
  }> | null;
  publication: Readonly<{
    kind: "candidate_ref";
    ref: string;
    commitSha: string;
    baseSha: string;
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
    typeof value.fileCount !== "number" ||
    typeof value.baseSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(value.baseSha)
  ) {
    return undefined;
  }

  return Object.freeze({
    path: value.path,
    sha256: value.sha256,
    fileCount: value.fileCount,
    baseSha: value.baseSha,
  });
}

function parsePublication(
  value: unknown,
): ExecutionResultDetail["publication"] | undefined {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    value.kind !== "candidate_ref" ||
    typeof value.ref !== "string" ||
    !value.ref.startsWith("refs/loop-engine/candidates/") ||
    typeof value.commitSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(value.commitSha) ||
    typeof value.baseSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(value.baseSha)
  ) {
    return undefined;
  }

  return Object.freeze({
    kind: "candidate_ref" as const,
    ref: value.ref,
    commitSha: value.commitSha,
    baseSha: value.baseSha,
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
    (value.mode !== "execute" && value.mode !== "publish") ||
    !isStringArray(value.modifiedFiles)
  ) {
    return null;
  }

  if (
    (value.runId !== undefined && typeof value.runId !== "string") ||
    (value.project !== undefined && typeof value.project !== "string")
  ) {
    return null;
  }

  const validation = parseValidation(value.validation);
  const patchExport = parsePatchExport(value.patchExport);
  const publication = parsePublication(value.publication);
  const failure = parseFailure(value.failure);
  if (
    validation === undefined ||
    patchExport === undefined ||
    publication === undefined ||
    failure === undefined
  ) {
    return null;
  }

  const status = value.status as ExecutionResultStatus;
  const mode = value.mode as ExecutionResultMode;
  const hasFailure = failure !== null;
  if (status === "completed" ? hasFailure : !hasFailure) return null;

  // Publish mode never carries a patch export (the isolated adapter clears
  // it once publication is attempted) and, on success, must carry the
  // candidate ref publication result. Execute mode must never carry a
  // publication — publish is the only V33 publication primitive.
  if (mode === "publish") {
    if (patchExport !== null) return null;
    if (status === "completed" && publication === null) return null;
  } else if (publication !== null) {
    return null;
  }

  return Object.freeze({
    status,
    mode,
    runId: typeof value.runId === "string" ? value.runId : null,
    project: typeof value.project === "string" ? value.project : null,
    modifiedFiles: Object.freeze([...value.modifiedFiles]),
    validation,
    patchExport,
    publication,
    failure,
  });
}

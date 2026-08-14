import YAML from "yaml";

export const EXECUTION_DECISION_STATES = [
  "READY",
  "BLOCKED",
  "REVALIDATION_REQUIRED",
  "NO_ACTIONABLE_WORK",
] as const;

export type ExecutionDecisionState = (typeof EXECUTION_DECISION_STATES)[number];

const GIT_HEAD_PATTERN = /^[0-9a-f]{40}$/i;

export type ExecutionDecisionFile = Readonly<{
  version: 1;
  project: string;
  decision: Readonly<{
    state: ExecutionDecisionState;
    reason?: string;
    nextAction?: string;
    candidate?: Readonly<{ id: string }>;
  }>;
  source: Readonly<{
    document?: string;
    gitHead: string;
  }>;
}>;

export type ExecutionDecisionParseResult =
  | Readonly<{ ok: true; decision: ExecutionDecisionFile }>
  | Readonly<{ ok: false; reason: string }>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Fail-closed parser for the authorization-critical V1 fields. Informational
// reason and nextAction values are retained only when non-empty strings; they
// never contribute to an authorization.
export function parseExecutionDecisionFile(
  raw: string,
): ExecutionDecisionParseResult {
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch {
    return { ok: false, reason: "Execution decision file is not valid YAML." };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: "Execution decision file must be a YAML mapping.",
    };
  }

  if (parsed.version !== 1) {
    return {
      ok: false,
      reason: "Execution decision file must declare version: 1.",
    };
  }

  if (!isNonEmptyString(parsed.project)) {
    return {
      ok: false,
      reason: "Execution decision file must declare a non-empty project.",
    };
  }

  const decisionRaw = parsed.decision;
  if (!isPlainObject(decisionRaw)) {
    return {
      ok: false,
      reason: "Execution decision file must declare a decision mapping.",
    };
  }

  const stateRaw = decisionRaw.state;
  if (
    typeof stateRaw !== "string" ||
    !EXECUTION_DECISION_STATES.includes(stateRaw as ExecutionDecisionState)
  ) {
    return {
      ok: false,
      reason: `Execution decision state must be one of: ${EXECUTION_DECISION_STATES.join(", ")}.`,
    };
  }
  const state = stateRaw as ExecutionDecisionState;

  let candidate: Readonly<{ id: string }> | undefined;
  if (decisionRaw.candidate !== undefined) {
    if (
      !isPlainObject(decisionRaw.candidate) ||
      !isNonEmptyString(decisionRaw.candidate.id)
    ) {
      return {
        ok: false,
        reason: "Execution decision candidate, when present, must declare a non-empty id.",
      };
    }
    candidate = { id: decisionRaw.candidate.id };
  }

  if (state === "READY" && candidate === undefined) {
    return {
      ok: false,
      reason: "Execution decision state READY requires decision.candidate.id.",
    };
  }

  const sourceRaw = parsed.source;
  if (!isPlainObject(sourceRaw)) {
    return {
      ok: false,
      reason: "Execution decision file must declare a source mapping.",
    };
  }

  const gitHead = sourceRaw.gitHead;
  if (typeof gitHead !== "string" || !GIT_HEAD_PATTERN.test(gitHead)) {
    return {
      ok: false,
      reason: "Execution decision source.gitHead must be a full 40-character SHA.",
    };
  }

  const document = sourceRaw.document;
  if (document !== undefined && !isNonEmptyString(document)) {
    return {
      ok: false,
      reason: "Execution decision source.document, when present, must be a non-empty string.",
    };
  }

  return {
    ok: true,
    decision: {
      version: 1,
      project: parsed.project,
      decision: {
        state,
        ...(isNonEmptyString(decisionRaw.reason)
          ? { reason: decisionRaw.reason }
          : {}),
        ...(isNonEmptyString(decisionRaw.nextAction)
          ? { nextAction: decisionRaw.nextAction }
          : {}),
        ...(candidate !== undefined ? { candidate } : {}),
      },
      source: {
        ...(document !== undefined ? { document } : {}),
        gitHead,
      },
    },
  };
}

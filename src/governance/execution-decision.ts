import YAML from "yaml";
import { parseAllowedPaths } from "../loop/file-scope.js";

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
    candidate?: Readonly<{ id: string; allowedPaths?: readonly string[] }>;
    brief?: Readonly<{
      objective: string;
      deliverables: readonly string[];
      outOfScope: readonly string[];
      /** Explicit case-insensitive terms that must not appear in generated content. */
      forbiddenContentTerms?: readonly string[];
    }>;
  }>;
  source: Readonly<{
    document?: string;
    gitHead: string;
  }>;
}>;

export type ExecutionDecisionParseResult =
  | Readonly<{ ok: true; decision: ExecutionDecisionFile }>
  | Readonly<{ ok: false; reason: string; code?: "scope_missing" | "scope_malformed" }>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
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

  let candidate: Readonly<{ id: string; allowedPaths?: readonly string[] }> | undefined;
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

  let brief: ExecutionDecisionFile["decision"]["brief"];
  if (decisionRaw.brief !== undefined) {
    if (
      !isPlainObject(decisionRaw.brief) ||
      !isNonEmptyString(decisionRaw.brief.objective) ||
      !isNonEmptyStringArray(decisionRaw.brief.deliverables) ||
      !isNonEmptyStringArray(decisionRaw.brief.outOfScope)
    ) {
      return {
        ok: false,
        reason: "Execution decision brief must declare objective, deliverables, and outOfScope.",
      };
    }
    const forbiddenContentTerms = decisionRaw.brief.forbiddenContentTerms;
    if (
      forbiddenContentTerms !== undefined &&
      !isNonEmptyStringArray(forbiddenContentTerms)
    ) {
      return {
        ok: false,
        reason: "Execution decision brief forbiddenContentTerms, when present, must be a non-empty string array.",
      };
    }
    brief = Object.freeze({
      objective: decisionRaw.brief.objective,
      deliverables: Object.freeze([...decisionRaw.brief.deliverables]),
      outOfScope: Object.freeze([...decisionRaw.brief.outOfScope]),
      ...(forbiddenContentTerms === undefined
        ? {}
        : {
            forbiddenContentTerms: Object.freeze([...forbiddenContentTerms]),
          }),
    });
  }

  if (state === "READY" && candidate === undefined) {
    return {
      ok: false,
      reason: "Execution decision state READY requires decision.candidate.id.",
    };
  }
  if (state === "READY") {
    const scope = parseAllowedPaths((decisionRaw.candidate as Record<string, unknown>).allowedPaths);
    if (!scope.ok) return { ok: false, code: scope.code, reason: scope.reason };
    candidate = { ...candidate!, allowedPaths: scope.allowedPaths };
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
        ...(brief !== undefined ? { brief } : {}),
      },
      source: {
        ...(document !== undefined ? { document } : {}),
        gitHead,
      },
    },
  };
}

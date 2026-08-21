import { isPathAllowed, parseAllowedPaths } from "../loop/file-scope.js";
import type { DraftValidationIssue } from "./execution-decision-errors.js";

export type ExecutionDecisionDraft = Readonly<{
  project: string;
  candidateId: string;
  sourceDocument: string;
  gitHead: string;
  objective: string;
  deliverables: readonly string[];
  outOfScope: readonly string[];
  allowedPaths: readonly string[];
  forbiddenContentTerms?: readonly string[];
}>;

type ProviderDraft = Readonly<{
  objective: unknown;
  deliverables: unknown;
  outOfScope: unknown;
  allowedPaths: unknown;
  forbiddenContentTerms?: unknown;
  candidateId?: unknown;
}>;

const MAX_ITEMS = 20;
const MAX_TEXT = 2_000;
const SHA = /^[0-9a-f]{40}$/i;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= MAX_TEXT;
const strings = (value: unknown): readonly string[] | null => Array.isArray(value) && value.length > 0 && value.length <= MAX_ITEMS && value.every(isText) ? Object.freeze([...value]) : null;

export function createExecutionDecisionDraft(
  local: Readonly<{ project: string; candidateId: string; sourceDocument: string; gitHead: string; executionDecisionPath: string }>,
  provider: ProviderDraft,
): Readonly<{ ok: true; draft: ExecutionDecisionDraft }> | Readonly<{ ok: false; code: "decision_draft_invalid"; draftValidationIssue: DraftValidationIssue; reason: string }> {
  const invalid = (draftValidationIssue: DraftValidationIssue, reason: string) => ({ ok: false as const, code: "decision_draft_invalid" as const, draftValidationIssue, reason });
  if (!isText(local.project) || !isText(local.candidateId) || !isText(local.sourceDocument) || !SHA.test(local.gitHead)) return invalid("provider_fields_invalid", "Local draft binding is invalid.");
  const decisionPath = parseAllowedPaths([local.executionDecisionPath]);
  if (!decisionPath.ok) return invalid("protected_path", "Configured execution decision path is invalid.");
  if (provider.candidateId !== undefined && provider.candidateId !== local.candidateId) return invalid("provider_fields_invalid", "Provider candidate does not match the selected candidate.");
  const deliverables = strings(provider.deliverables); const outOfScope = strings(provider.outOfScope);
  if (!isText(provider.objective) || deliverables === null || outOfScope === null) return invalid("provider_fields_invalid", "Provider draft fields are invalid or unbounded.");
  const scope = parseAllowedPaths(provider.allowedPaths);
  if (!scope.ok) return invalid("allowed_paths_invalid", scope.reason);
  if (scope.allowedPaths.some((path) => path === ".git" || path.startsWith(".git/") || path === ".governance" || path.startsWith(".governance/")) || isPathAllowed(local.executionDecisionPath, scope.allowedPaths)) return invalid("protected_path", "Provider draft contains a protected path.");
  const forbiddenContentTerms = provider.forbiddenContentTerms === undefined ? undefined : strings(provider.forbiddenContentTerms);
  if (provider.forbiddenContentTerms !== undefined && forbiddenContentTerms === null) return invalid("forbidden_terms_invalid", "Provider forbidden content terms are invalid or unbounded.");
  const optionalTerms = forbiddenContentTerms === null || forbiddenContentTerms === undefined ? {} : { forbiddenContentTerms };
  return { ok: true, draft: Object.freeze({ project: local.project, candidateId: local.candidateId, sourceDocument: local.sourceDocument, gitHead: local.gitHead, objective: provider.objective, deliverables, outOfScope, allowedPaths: scope.allowedPaths, ...optionalTerms }) };
}

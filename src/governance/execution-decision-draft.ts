import { isPathAllowed, parseAllowedPaths } from "../loop/file-scope.js";

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
): Readonly<{ ok: true; draft: ExecutionDecisionDraft }> | Readonly<{ ok: false; code: "decision_draft_invalid"; reason: string }> {
  if (!isText(local.project) || !isText(local.candidateId) || !isText(local.sourceDocument) || !SHA.test(local.gitHead)) return { ok: false, code: "decision_draft_invalid", reason: "Local draft binding is invalid." };
  const decisionPath = parseAllowedPaths([local.executionDecisionPath]);
  if (!decisionPath.ok) return { ok: false, code: "decision_draft_invalid", reason: "Configured execution decision path is invalid." };
  if (provider.candidateId !== undefined && provider.candidateId !== local.candidateId) return { ok: false, code: "decision_draft_invalid", reason: "Provider candidate does not match the selected candidate." };
  const deliverables = strings(provider.deliverables); const outOfScope = strings(provider.outOfScope);
  if (!isText(provider.objective) || deliverables === null || outOfScope === null) return { ok: false, code: "decision_draft_invalid", reason: "Provider draft fields are invalid or unbounded." };
  const scope = parseAllowedPaths(provider.allowedPaths);
  if (!scope.ok) return { ok: false, code: "decision_draft_invalid", reason: scope.reason };
  if (isPathAllowed(".git", scope.allowedPaths) || isPathAllowed(".git/config", scope.allowedPaths) || isPathAllowed(local.executionDecisionPath, scope.allowedPaths)) return { ok: false, code: "decision_draft_invalid", reason: "Provider draft contains a protected path." };
  const forbiddenContentTerms = provider.forbiddenContentTerms === undefined ? undefined : strings(provider.forbiddenContentTerms);
  if (provider.forbiddenContentTerms !== undefined && forbiddenContentTerms === null) return { ok: false, code: "decision_draft_invalid", reason: "Provider forbidden content terms are invalid or unbounded." };
  const optionalTerms = forbiddenContentTerms === null || forbiddenContentTerms === undefined ? {} : { forbiddenContentTerms };
  return { ok: true, draft: Object.freeze({ project: local.project, candidateId: local.candidateId, sourceDocument: local.sourceDocument, gitHead: local.gitHead, objective: provider.objective, deliverables, outOfScope, allowedPaths: scope.allowedPaths, ...optionalTerms }) };
}

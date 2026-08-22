import { stringify as stringifyYaml } from "yaml";
import { randomUUID } from "node:crypto";
import { createExecutionDecisionDraft, type ExecutionDecisionDraft } from "./execution-decision-draft.js";

export type StoredExecutionDecisionDraft = Readonly<{ draft: ExecutionDecisionDraft; projectPath: string; executionDecisionPath: string }>;
export type ExecutionDecisionDraftStore = ReturnType<typeof createExecutionDecisionDraftStore>;
export function createExecutionDecisionDraftStore(maxDrafts = 16) {
  const drafts = new Map<string, StoredExecutionDecisionDraft>();
  const idsByProject = new Map<string, string>();
  return Object.freeze({
    put(draft: ExecutionDecisionDraft, projectPath: string, executionDecisionPath: string) { const previous = idsByProject.get(draft.project); if (previous) drafts.delete(previous); if (drafts.size >= maxDrafts) return null; const id = randomUUID(); drafts.set(id, { draft, projectPath, executionDecisionPath }); idsByProject.set(draft.project, id); return id; },
    get(id: unknown) { return typeof id === "string" ? drafts.get(id) ?? null : null; },
    consume(id: string) { const stored = drafts.get(id); drafts.delete(id); if (stored && idsByProject.get(stored.draft.project) === id) idsByProject.delete(stored.draft.project); },
  });
}

export function serializeReadyExecutionDecision(draft: ExecutionDecisionDraft): string {
  return stringifyYaml({ version: 1, project: draft.project, decision: { state: "READY", reason: "Approved explicit execution decision.", nextAction: "Run plan for the approved candidate.", candidate: { id: draft.candidateId, allowedPaths: draft.allowedPaths }, brief: { objective: draft.objective, deliverables: draft.deliverables, outOfScope: draft.outOfScope, ...(draft.forbiddenContentTerms === undefined ? {} : { forbiddenContentTerms: draft.forbiddenContentTerms }) } }, source: { document: draft.sourceDocument, gitHead: draft.gitHead } });
}

export function prepareStoredExecutionDecisionDraft(local: Parameters<typeof createExecutionDecisionDraft>[0], provider: Parameters<typeof createExecutionDecisionDraft>[1], store: ExecutionDecisionDraftStore) {
  const result = createExecutionDecisionDraft(local, provider); if (!result.ok) return result;
  const projectPath = "projectPath" in local && typeof local.projectPath === "string" ? local.projectPath : "";
  if (projectPath.length === 0) return { ok: false as const, code: "decision_draft_invalid" as const, reason: "Local project path is invalid." };
  const draftId = store.put(result.draft, projectPath, local.executionDecisionPath); return draftId === null ? { ok: false as const, code: "decision_draft_invalid" as const, reason: "Draft store capacity reached." } : { ok: true as const, draftId, draft: result.draft };
}

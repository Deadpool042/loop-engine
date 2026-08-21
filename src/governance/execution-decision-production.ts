import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveContextPath } from "../context/path.js";
import type { ExecutionDecisionCurrent, ExecutionDecisionPublicationFailureCode, ExecutionDecisionPublicationResult } from "./execution-decision-service.js";
import { loadConfig, type ProjectConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import { generateProjectReport } from "../core/reports.js";
import { getLastCommit } from "../core/git.js";
import { parseExecutionDecisionFile } from "./execution-decision.js";
import { resolveExecutionAuthorization } from "./execution-authorization.js";
import type { ExecutionDecisionDraft } from "./execution-decision-draft.js";
import { createExecutionDecisionService, type ExecutionDecisionProviderProposal } from "./execution-decision-service.js";
import { createExecutionDecisionDraftStore } from "./execution-decision-approval.js";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/i;
export type ProductionCurrent = ExecutionDecisionCurrent & Readonly<{ projectConfig: ProjectConfig }>;
export function getCurrentExecutionDecisionState(projectName: string, dependencies: Readonly<{ loadConfig?: typeof loadConfig; findProject?: typeof findProject; report?: typeof generateProjectReport; lastCommit?: typeof getLastCommit }> = {}): ProductionCurrent | null {
  const project = (dependencies.findProject ?? findProject)((dependencies.loadConfig ?? loadConfig)(), projectName); if (!project || typeof project.execution_decision !== "string" || project.execution_decision.trim().length === 0) return null;
  const projectPath = resolve(project.path); const decision = resolveContextPath(projectPath, project.execution_decision); if (!decision.insideProject || decision.absolutePath === projectPath) return null;
  const snapshot = (dependencies.report ?? generateProjectReport)(project); const candidate = snapshot.roadmap.selectedCandidate; const head = (dependencies.lastCommit ?? getLastCommit)(projectPath)?.hash;
  if (!candidate?.id || candidate.status === "done" || candidate.admissibility?.state === "not_admissible" || !SHA.test(head ?? "") || !candidate.path) return null;
  const source = resolveContextPath(projectPath, candidate.path); if (!source.insideProject) return null;
  return { project: project.name, projectPath, candidateId: candidate.id, gitHead: head!, sourceDocument: candidate.path, executionDecisionPath: project.execution_decision, projectConfig: project };
}

export function validatePublishedExecutionDecision(current: ExecutionDecisionCurrent, draft: ExecutionDecisionDraft, read: typeof readFileSync = readFileSync): boolean {
  const destination = resolveContextPath(current.projectPath, current.executionDecisionPath); if (!destination.insideProject) return false;
  let raw: string; try { raw = read(destination.absolutePath, "utf8"); } catch { return false; }
  const parsed = parseExecutionDecisionFile(raw); if (!parsed.ok) return false;
  const project = (current as ProductionCurrent).projectConfig ?? findProject(loadConfig(), current.project); if (!project || resolve(project.path) !== current.projectPath || project.execution_decision !== current.executionDecisionPath) return false;
  const authorization = resolveExecutionAuthorization(project, current.projectPath, current.gitHead);
  return authorization.governed && authorization.authorized && authorization.candidateId === draft.candidateId && JSON.stringify(authorization.allowedPaths) === JSON.stringify(draft.allowedPaths);
}

export function createProductionExecutionDecisionService(propose: (current: ExecutionDecisionCurrent) => Promise<ExecutionDecisionProviderProposal>, dependencies: Readonly<{ current?: (projectName: string) => Promise<ExecutionDecisionCurrent | null> }> = {}) {
  const store = createExecutionDecisionDraftStore(); const publish = createProductionTransactionPort();
  return createExecutionDecisionService({
    current: dependencies.current ?? (async (projectName) => getCurrentExecutionDecisionState(projectName)),
    propose,
    publishTransaction: publish,
    validate: async (current, draft) => validatePublishedExecutionDecision(current, draft),
  }, store);
}

export type DecisionPublication = Readonly<{ commit: () => boolean; recover: () => boolean }>;
const PUBLISH_ERRNOS = new Set(["EMFILE", "ENFILE", "EACCES", "EPERM", "ENOENT", "ENOSPC", "EROFS", "EIO"]);
function publicationFailure(code: ExecutionDecisionPublicationFailureCode, error?: unknown): Extract<ExecutionDecisionPublicationResult, { ok: false }> {
  const errno = error instanceof Error && "code" in error && typeof error.code === "string" && PUBLISH_ERRNOS.has(error.code) ? error.code as Extract<ExecutionDecisionPublicationResult, { ok: false }>["errno"] : undefined;
  return { ok: false, code, ...(errno === undefined ? {} : { errno }) };
}
export function createTransactionalDecisionPublisher(options: Readonly<{ writeFile?: typeof writeFileSync; rename?: typeof renameSync; readFile?: typeof readFileSync; exists?: typeof existsSync; remove?: typeof rmSync }>) {
  const write = options.writeFile ?? writeFileSync, rename = options.rename ?? renameSync, read = options.readFile ?? readFileSync, exists = options.exists ?? existsSync, remove = options.remove ?? rmSync;
  return (projectPath: string, relativePath: string, contents: string): Readonly<{ ok: true; publication: DecisionPublication }> | Extract<ExecutionDecisionPublicationResult, { ok: false }> => {
    const destination = resolveContextPath(projectPath, relativePath); if (!destination.insideProject) return publicationFailure("decision_draft_write_failed");
    let previous: string | undefined; if (exists(destination.absolutePath)) { try { previous = read(destination.absolutePath, "utf8"); } catch (error) { return publicationFailure("decision_draft_read_previous_failed", error); } }
    const temporary = join(dirname(destination.absolutePath), `.${randomUUID()}.tmp`);
    try { write(temporary, contents, { mode: 0o600 }); } catch (error) { try { remove(temporary, { force: true }); } catch {} return publicationFailure("decision_draft_write_temp_failed", error); }
    try { rename(temporary, destination.absolutePath); } catch (error) { try { remove(temporary, { force: true }); } catch {} return publicationFailure("decision_draft_rename_failed", error); }
    return { ok: true, publication: { commit: () => true, recover: () => { try { if (previous === undefined) remove(destination.absolutePath, { force: true }); else { const rollback = join(dirname(destination.absolutePath), `.${randomUUID()}.tmp`); write(rollback, previous, { mode: 0o600 }); rename(rollback, destination.absolutePath); } return true; } catch { return false; } } } };
  };
}

export function createProductionTransactionPort() {
  const publish = createTransactionalDecisionPublisher({});
  return async (current: ExecutionDecisionCurrent, contents: string) => {
    const result = publish(current.projectPath, current.executionDecisionPath, contents);
    return result.ok ? { ok: true as const, commit: result.publication.commit, recover: result.publication.recover } : result;
  };
}

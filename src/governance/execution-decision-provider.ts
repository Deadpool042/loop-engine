import { resolveRoadmapProposalProfile } from "../intelligence/roadmap-proposal-routing.js";
import type { TextOnlyProvider, TextOnlyProviderFailure } from "../text-only-provider/index.js";
import type { ExecutionDecisionCurrent, ExecutionDecisionProviderProposal } from "./execution-decision-service.js";
import { loadConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import { generateProjectReport } from "../core/reports.js";
import { ExecutionDecisionPreparationPassthroughFailure } from "./execution-decision-errors.js";

export const EXECUTION_DECISION_PROPOSAL_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["objective", "deliverables", "outOfScope", "allowedPaths"], properties: { objective: { type: "string" }, deliverables: { type: "array", items: { type: "string" } }, outOfScope: { type: "array", items: { type: "string" } }, allowedPaths: { type: "array", items: { type: "string" } }, forbiddenContentTerms: { type: "array", items: { type: "string" } } } });
const SYSTEM = "Propose only a decision draft. You cannot authorize READY. Use only supplied JSON. Return JSON only. Allowed paths MUST be exact repository-relative POSIX file paths, or a terminal /** scope only when multiple files are genuinely required. NEVER return paths ending with /, bare directories, .git, .governance, the execution decision file, or broad parent directories when exact files can be named. Prefer exact files: for an ADR, propose a precise filename such as docs/adr/0007-cockpit-architecture.md. No tools, shell, web, Git, or filesystem.";
export class ExecutionDecisionProviderFailure extends ExecutionDecisionPreparationPassthroughFailure { readonly failure: TextOnlyProviderFailure; constructor(failure: TextOnlyProviderFailure) { super(); this.message = "Execution decision provider failed."; this.name = "ExecutionDecisionProviderFailure"; this.failure = failure; } }
function isStringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function parse(value: unknown): ExecutionDecisionProviderProposal | null { if(typeof value!=="object"||value===null||Array.isArray(value))return null;const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!["objective","deliverables","outOfScope","allowedPaths","forbiddenContentTerms"].includes(k))||typeof v.objective!=="string"||!isStringArray(v.deliverables)||!isStringArray(v.outOfScope)||!isStringArray(v.allowedPaths)||(v.forbiddenContentTerms!==undefined&&!isStringArray(v.forbiddenContentTerms)))return null;return v as ExecutionDecisionProviderProposal; }
export type ExecutionDecisionProviderCompleted = Readonly<{ status: "completed"; provider: string; model: string; effort: "low"; durationMs: number; usage?: Readonly<{ inputTokens: number; outputTokens: number }>; proposal: ExecutionDecisionProviderProposal }>;
export async function proposeExecutionDecisionWithTelemetry(provider: TextOnlyProvider, current: ExecutionDecisionCurrent, dependencies: Readonly<{ loadConfig?: typeof loadConfig; findProject?: typeof findProject; report?: typeof generateProjectReport }> = {}): Promise<ExecutionDecisionProviderCompleted> {
  const profile = resolveRoadmapProposalProfile("balanced");
  const project=(dependencies.findProject??findProject)((dependencies.loadConfig??loadConfig)(),current.project);const snapshot=project?(dependencies.report??generateProjectReport)(project):null;const candidate=snapshot?.roadmap.selectedCandidate;
  if(!project||!snapshot||!candidate?.id||candidate.id!==current.candidateId||candidate.path!==current.sourceDocument)throw new Error("Execution decision context is stale.");
  const context={project:{name:project.name,type:project.type,objective:snapshot.objective.content??null},planning:{mode:snapshot.planning.mode},candidate:{id:candidate.id,text:candidate.text,source:candidate.path},roadmap:{summary:snapshot.roadmap.summary}};
  const result = await provider.invoke({ systemPrompt: SYSTEM, contextJson: JSON.stringify(context), model: profile.model, effort: "low", timeoutMs: 60_000, outputSchema: { schema: EXECUTION_DECISION_PROPOSAL_SCHEMA } });
  if (result.status !== "completed") throw new ExecutionDecisionProviderFailure(result);
  let output: unknown; try { output = JSON.parse(result.output); } catch { throw new Error("Execution decision proposal is invalid."); }
  const proposal=parse(output);if(!proposal)throw new Error("Execution decision proposal is invalid.");
  return Object.freeze({ status: "completed", provider: result.provider, model: result.model, effort: "low", durationMs: result.durationMs, ...(result.usage === undefined ? {} : { usage: result.usage }), proposal });
}
export function createExecutionDecisionProposalProvider(provider: TextOnlyProvider, dependencies: Readonly<{ loadConfig?: typeof loadConfig; findProject?: typeof findProject; report?: typeof generateProjectReport }> = {}): (current: ExecutionDecisionCurrent) => Promise<ExecutionDecisionProviderProposal> {
  return async (current) => (await proposeExecutionDecisionWithTelemetry(provider, current, dependencies)).proposal;
}

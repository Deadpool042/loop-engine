import { createAnthropicApiProvider, calculateCostUsd, resolveAnthropicPricing, type TextOnlyProvider } from "../text-only-provider/index.js";
import { ExecutionDecisionProviderFailure, proposeExecutionDecisionWithTelemetry } from "../governance/execution-decision-provider.js";
import { getCurrentExecutionDecisionState, type ProductionCurrent } from "../governance/execution-decision-production.js";
import type { ExecutionDecisionCurrent } from "../governance/execution-decision-service.js";
import { createExecutionDecisionDraft } from "../governance/execution-decision-draft.js";

export type ExecutionDecisionCliResult = Readonly<{ schemaVersion: 1; project: string; result: Readonly<{ status: "completed"; provider: string; model: string; effort: "low"; durationMs: number; usage?: Readonly<{ inputTokens: number; outputTokens: number }>; actualCalculatedCostUsd?: number; pricingEffectiveDate?: string }> ; proposal: Readonly<{ objective: unknown; deliverables: unknown; outOfScope: unknown; allowedPaths: unknown; forbiddenContentTerms?: unknown }> }> | Readonly<{ schemaVersion: 1; project: string; result: Readonly<{ status: "stale"; code: "decision_draft_stale" } | { status: "failed"; code: string; model?: string; durationMs?: number; usage?: Readonly<{ inputTokens: number; outputTokens: number }>; actualCalculatedCostUsd?: number; pricingEffectiveDate?: string; draftValidationIssue?: "provider_fields_invalid" | "allowed_paths_invalid" | "protected_path" | "forbidden_terms_invalid"; httpStatus?: number; providerErrorType?: string }> }>;
export type ExecutionDecisionProposeInput = Readonly<{ project: string; candidateId: string; sourceDocument: string; gitHead: string; provider: "anthropic_api"; model: "claude-sonnet-5"; effort: "low"; timeoutMs: 60_000 }>;
type Dependencies = Readonly<{ current?: (project: string) => ProductionCurrent | null; createProvider?: () => TextOnlyProvider; propose?: typeof proposeExecutionDecisionWithTelemetry }>;
function sameBindings(current: ExecutionDecisionCurrent | null, input: ExecutionDecisionProposeInput): current is ExecutionDecisionCurrent { return current !== null && current.project === input.project && current.candidateId === input.candidateId && current.sourceDocument === input.sourceDocument && current.gitHead === input.gitHead; }
export async function runExecutionDecisionProposal(input: ExecutionDecisionProposeInput, dependencies: Dependencies = {}): Promise<ExecutionDecisionCliResult> {
  const current = (dependencies.current ?? getCurrentExecutionDecisionState)(input.project);
  if (!sameBindings(current, input)) return { schemaVersion: 1, project: input.project, result: { status: "stale", code: "decision_draft_stale" } };
  try {
    const completed = await (dependencies.propose ?? proposeExecutionDecisionWithTelemetry)((dependencies.createProvider ?? (() => createAnthropicApiProvider()))(), current);
    const pricing = completed.usage === undefined ? null : resolveAnthropicPricing(completed.model);
    const pricingMetadata = pricing === null || pricing.effectiveFrom === "1970-01-01" ? {} : { pricingEffectiveDate: pricing.effectiveFrom };
    const telemetry = { model: completed.model, durationMs: completed.durationMs, ...(completed.usage === undefined ? {} : { usage: completed.usage }), ...(pricing === null || completed.usage === undefined ? {} : { actualCalculatedCostUsd: calculateCostUsd(completed.usage.inputTokens, completed.usage.outputTokens, pricing), ...pricingMetadata }) };
    const draft = createExecutionDecisionDraft(current, completed.proposal);
    if (!draft.ok) return { schemaVersion: 1, project: input.project, result: { status: "failed", code: "decision_draft_invalid", draftValidationIssue: draft.draftValidationIssue, ...telemetry } };
    return { schemaVersion: 1, project: input.project, result: { status: "completed", provider: completed.provider, effort: "low", ...telemetry }, proposal: completed.proposal };
  } catch (error) {
    if (error instanceof ExecutionDecisionProviderFailure) { const failure = error.failure; return { schemaVersion: 1, project: input.project, result: { status: "failed", code: failure.code, ...(failure.model === null ? {} : { model: failure.model }), durationMs: failure.durationMs, ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }), ...(failure.providerErrorType === undefined ? {} : { providerErrorType: failure.providerErrorType }) } }; }
    return { schemaVersion: 1, project: input.project, result: { status: "failed", code: "provider_response_invalid" } };
  }
}

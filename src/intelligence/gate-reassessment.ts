import {
  MAX_TEXT_ONLY_CONTEXT_BYTES,
  type AnthropicEffort,
  type TextOnlyProvider,
  type TextOnlyProviderUsage,
} from "../text-only-provider/index.js";
import type { RoadmapProposalContextReport } from "../core/reports.js";

export const GATE_REASSESSMENT_SYSTEM_PROMPT = `Loop Engine gate reassessment contract v1.
Use only the supplied canonical JSON context. Do not inspect files, tools, history, Git, web, or external systems. Never infer external facts. Closed gates remain authoritative: you may only recommend manual review, never open, alter, or bypass a gate. Return review_recommended only when the supplied context contains a concrete new signal relevant to a closed gate; otherwise return no_new_signal. Output only JSON.`;
export const GATE_REASSESSMENT_OUTPUT_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false, required: ["assessment"], properties: {
    assessment: { anyOf: [
      { type: "object", additionalProperties: false, required: ["status", "reason"], properties: { status: { type: "string", const: "no_new_signal" }, reason: { type: "string", maxLength: 500 } } },
      { type: "object", additionalProperties: false, required: ["status", "reason", "gates"], properties: { status: { type: "string", const: "review_recommended" }, reason: { type: "string", maxLength: 500 }, gates: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["phase", "blockedBy", "observedSignal", "recommendation"], properties: { phase: { type: "string", maxLength: 160 }, blockedBy: { type: "string", maxLength: 160 }, observedSignal: { type: "string", maxLength: 500 }, recommendation: { type: "string", maxLength: 500 } } } } } },
    ] },
  },
});
export const GATE_REASSESSMENT_ESTIMATED_OUTPUT_TOKENS = 300;
export const GATE_REASSESSMENT_ESTIMATED_STRUCTURED_OUTPUT_OVERHEAD_TOKENS = 400;
const MAX_BYTES = 16 * 1024;

export type GateReassessment = Readonly<
  | { status: "no_new_signal"; reason: string }
  | { status: "review_recommended"; reason: string; gates: readonly Readonly<{ phase: string; blockedBy: string; observedSignal: string; recommendation: string }>[] }
>;
/** Present only for reason: "provider_error" — the underlying provider failure's own telemetry (never the validation telemetry, which requires a completed provider call), so a retried/failed call is never silently invisible. Never includes the provider's diagnosticMessage. */
export type GateReassessmentProviderFailure = Readonly<{ code: string; durationMs: number; attempts?: number; requestId?: string; httpStatus?: number }>;
export type GateReassessmentReport = Readonly<{ schemaVersion: 1; project: Readonly<{ name: string }>; result: Readonly<{ status: "unavailable"; reason: string } | { status: "failed"; reason: "provider_error" | "invalid_reassessment_response"; validationFailureCode?: string; provider?: string; model?: string; effort?: AnthropicEffort | null; durationMs?: number; usage?: TextOnlyProviderUsage; providerFailure?: GateReassessmentProviderFailure } | { status: "completed"; provider: string; model: string; effort: AnthropicEffort | null; durationMs: number; usage?: TextOnlyProviderUsage; normalizationWarnings?: readonly string[] }>; assessment?: GateReassessment }>;

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number): Readonly<{ value: string; truncated: boolean }> | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Object.freeze({ value: value.slice(0, max), truncated: value.length > max });
}
function contextJson(context: RoadmapProposalContextReport): string | null {
  if (context.context !== "available" || context.roadmap.phaseGates.truncated) return null;
  const gates = context.roadmap.phaseGates.items.filter((gate) => gate.state === "closed").map((gate) => ({ phase: gate.phaseId, blockedBy: gate.blockedBy ?? "" }));
  if (gates.length === 0) return null;
  return JSON.stringify({ schemaVersion: 1, project: context.project, objective: context.objective.content ?? "", roadmap: { stats: context.roadmap.stats, candidates: context.roadmap.candidates.items, closedGates: gates }, projectState: context.projectState });
}
export function buildGateReassessmentContext(context: RoadmapProposalContextReport): string | null { return contextJson(context); }
export function parseGateReassessment(output: string): Readonly<{ ok: true; assessment: GateReassessment; normalizationWarnings: readonly string[] }> | Readonly<{ ok: false; code: string }> {
  if (Buffer.byteLength(output, "utf8") > MAX_BYTES) return { ok: false, code: "response_too_large" };
  let value: unknown; try { value = JSON.parse(output); } catch { return { ok: false, code: "invalid_json" }; }
  if (!record(value) || !record(value.assessment)) return { ok: false, code: "invalid_root" };
  const assessment = value.assessment; const status = typeof assessment.status === "string" ? assessment.status.toLowerCase() : "";
  const warnings = new Set<string>(); const reason = bounded(assessment.reason, 500);
  if (reason === null) return { ok: false, code: "invalid_reason" }; if (reason.truncated) warnings.add("reason_truncated");
  if (status === "no_new_signal") { if ("gates" in assessment) return { ok: false, code: "unexpected_gates" }; return { ok: true, assessment: Object.freeze({ status: "no_new_signal" as const, reason: reason.value }), normalizationWarnings: [...warnings] }; }
  if (status !== "review_recommended" || !Array.isArray(assessment.gates) || assessment.gates.length === 0) return { ok: false, code: "invalid_assessment" };
  const gates = assessment.gates.slice(0, 3).map((gate) => {
    if (!record(gate)) return null;
    const phase = bounded(gate.phase, 160); const blockedBy = bounded(gate.blockedBy, 160); const observedSignal = bounded(gate.observedSignal, 500); const recommendation = bounded(gate.recommendation, 500);
    if (!phase || !blockedBy || !observedSignal || !recommendation) return null;
    if (phase.truncated || blockedBy.truncated || observedSignal.truncated || recommendation.truncated) warnings.add("gate_text_truncated");
    return Object.freeze({ phase: phase.value, blockedBy: blockedBy.value, observedSignal: observedSignal.value, recommendation: recommendation.value });
  });
  if (gates.some((gate) => gate === null)) return { ok: false, code: "invalid_gate" }; if (assessment.gates.length > 3) warnings.add("gates_truncated");
  return { ok: true, assessment: Object.freeze({ status: "review_recommended" as const, reason: reason.value, gates: Object.freeze(gates.filter((gate): gate is NonNullable<typeof gate> => gate !== null)) }), normalizationWarnings: [...warnings] };
}
export async function generateGateReassessmentFromContext(context: RoadmapProposalContextReport, input: Readonly<{ provider: TextOnlyProvider; providerAvailable: boolean; model: string; effort?: AnthropicEffort; timeoutMs: number }>): Promise<GateReassessmentReport> {
  const unavailable = (reason: string): GateReassessmentReport => ({ schemaVersion: 1, project: { name: context.project.name }, result: { status: "unavailable", reason } });
  const json = contextJson(context); if (json === null) return unavailable("gate_reassessment_context_unavailable");
  if (Buffer.byteLength(json, "utf8") > MAX_TEXT_ONLY_CONTEXT_BYTES) return unavailable("gate_reassessment_context_too_large");
  if (!input.providerAvailable) return unavailable("credential_unavailable");
  const invoked = await input.provider.invoke({ systemPrompt: GATE_REASSESSMENT_SYSTEM_PROMPT, contextJson: json, model: input.model, timeoutMs: input.timeoutMs, outputSchema: { schema: GATE_REASSESSMENT_OUTPUT_SCHEMA }, ...(input.effort === undefined ? {} : { effort: input.effort }) });
  if (invoked.status === "failed")
    return {
      schemaVersion: 1,
      project: { name: context.project.name },
      result: {
        status: "failed",
        reason: "provider_error",
        providerFailure: {
          code: invoked.code,
          durationMs: invoked.durationMs,
          ...(invoked.attempts === undefined
            ? {}
            : { attempts: invoked.attempts }),
          ...(invoked.requestId === undefined
            ? {}
            : { requestId: invoked.requestId }),
          ...(invoked.httpStatus === undefined
            ? {}
            : { httpStatus: invoked.httpStatus }),
        },
      },
    };
  const parsed = parseGateReassessment(invoked.output);
  if (!parsed.ok) return { schemaVersion: 1, project: { name: context.project.name }, result: { status: "failed", reason: "invalid_reassessment_response", validationFailureCode: parsed.code, provider: invoked.provider, model: invoked.model, effort: invoked.effort ?? null, durationMs: invoked.durationMs, ...(invoked.usage ? { usage: invoked.usage } : {}) } };
  return { schemaVersion: 1, project: { name: context.project.name }, result: { status: "completed", provider: invoked.provider, model: invoked.model, effort: invoked.effort ?? null, durationMs: invoked.durationMs, ...(invoked.usage ? { usage: invoked.usage } : {}), ...(parsed.normalizationWarnings.length ? { normalizationWarnings: parsed.normalizationWarnings } : {}) }, assessment: parsed.assessment };
}

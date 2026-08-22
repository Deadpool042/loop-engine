import assert from "node:assert/strict";
import test from "node:test";
import { generateGateReassessmentFromContext, parseGateReassessment } from "../../src/intelligence/gate-reassessment.js";

function canonicalContext() {
  return {
    context: "available", project: { name: "lp-infra", type: "infra" }, objective: { content: "Canonical objective." }, roadmap: { stats: { total: 2, todo: 2, inProgress: 0, done: 0, unknown: 0, blocked: 0 }, candidates: { items: [], total: 0, truncated: false }, phaseGates: { items: [{ phaseId: "H4", state: "closed", blockedBy: "retours-terrain-2027" }], total: 1, truncated: false } }, projectState: { git: { clean: true }, validation: { configured: true } },
  } as never;
}

test("accepts no_new_signal as a completed business outcome", () => {
  const parsed = parseGateReassessment(JSON.stringify({ assessment: { status: "no_new_signal", reason: "Le contexte ne contient aucun fait nouveau." } }));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.assessment.status, "no_new_signal");
});
test("bounds review_recommended to three normalized gates and never carries an opening action", () => {
  const parsed = parseGateReassessment(JSON.stringify({ assessment: { status: "review_recommended", reason: "Signal canonique observé.", gates: Array.from({ length: 4 }, (_, index) => ({ phase: `H${index + 1}`, blockedBy: "H0-RC", observedSignal: "Fait explicitement présent.", recommendation: "Réexaminer manuellement la condition." })) } }));
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.assessment.status === "review_recommended") {
    assert.equal(parsed.assessment.gates.length, 3);
    assert.match(parsed.assessment.gates[0]!.recommendation, /Réexaminer/);
  }
});
test("rejects malformed gate output", () => {
  const parsed = parseGateReassessment(JSON.stringify({ assessment: { status: "review_recommended", reason: "x", gates: [{ phase: "H4" }] } }));
  assert.deepEqual(parsed, { ok: false, code: "invalid_gate" });
});
test("calls the provider once and never mutates canonical gates or admissibility", async () => {
  const context = canonicalContext(); const before = JSON.stringify(context); let calls = 0;
  const report = await generateGateReassessmentFromContext(context, { providerAvailable: true, model: "claude-haiku-4-5", timeoutMs: 60_000, provider: { invoke: async () => { calls++; return { status: "completed" as const, provider: "anthropic_api", model: "claude-haiku-4-5", durationMs: 12, output: JSON.stringify({ assessment: { status: "review_recommended", reason: "Signal canonique.", gates: [{ phase: "H4", blockedBy: "retours-terrain-2027", observedSignal: "Signal.", recommendation: "remove the gate immediately" }] } }), usage: { inputTokens: 11, outputTokens: 7 } }; } } });
  assert.equal(calls, 1); assert.equal(report.result.status, "completed"); assert.equal(JSON.stringify(context), before);
  if (report.assessment?.status === "review_recommended") assert.equal(report.assessment.gates[0]?.recommendation, "remove the gate immediately");
});
test("surfaces the provider failure's own telemetry, never a diagnosticMessage, on provider_error", async () => {
  const context = canonicalContext();
  const report = await generateGateReassessmentFromContext(context, { providerAvailable: true, model: "claude-haiku-4-5", timeoutMs: 60_000, provider: { invoke: async () => ({ status: "failed" as const, provider: "anthropic_api", model: "claude-haiku-4-5", code: "provider_server_error" as const, message: "Anthropic API request failed.", diagnosticMessage: "raw provider text sk-test-secret", durationMs: 45, attempts: 3, requestId: "req_gate_1", httpStatus: 503, truncated: false }) } });
  assert.equal(report.result.status, "failed");
  if (report.result.status === "failed") {
    assert.equal(report.result.reason, "provider_error");
    assert.equal(report.result.usage, undefined);
    assert.equal(report.result.model, undefined);
    assert.deepEqual(report.result.providerFailure, { code: "provider_server_error", durationMs: 45, attempts: 3, requestId: "req_gate_1", httpStatus: 503 });
  }
  assert.doesNotMatch(JSON.stringify(report), /raw provider text|sk-test-secret/);
});

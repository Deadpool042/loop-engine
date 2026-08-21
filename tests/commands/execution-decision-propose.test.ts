import assert from "node:assert/strict";
import { test } from "node:test";
import { runExecutionDecisionProposal } from "../../src/composition/execution-decision-proposal.js";
import { ExecutionDecisionProviderFailure } from "../../src/governance/execution-decision-provider.js";

const sha = "a".repeat(40);
const current = { project: "lp-infra", projectPath: "/tmp/lp", candidateId: "H4-L1", sourceDocument: "docs/roadmap.md", gitHead: sha, executionDecisionPath: ".governance/execution-decision.yaml", projectConfig: {} } as never;
const input = { project: "lp-infra", candidateId: "H4-L1", sourceDocument: "docs/roadmap.md", gitHead: sha, provider: "anthropic_api" as const, model: "claude-sonnet-5" as const, effort: "low" as const, timeoutMs: 60_000 as const };

test("execution-decision CLI fails stale before provider invocation for every current binding mismatch", async () => {
  for (const changed of [{ candidateId: "H4-L2" }, { sourceDocument: "other.md" }, { gitHead: "b".repeat(40) }]) {
    let calls = 0;
    const report = await runExecutionDecisionProposal(input, { current: () => ({ ...current, ...changed }), createProvider: () => ({ invoke: async () => { calls++; throw new Error("must not invoke"); } }) });
    assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "stale", code: "decision_draft_stale" } });
    assert.equal(calls, 0);
  }
});

test("execution-decision CLI returns bounded provider telemetry and proposal with one invocation", async () => {
  let calls = 0;
  const report = await runExecutionDecisionProposal(input, { current: () => current, createProvider: () => ({ invoke: async () => { calls++; throw new Error("injected proposer owns this"); } }), propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 12, usage: { inputTokens: 100, outputTokens: 20 }, proposal: { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md"] } }) });
  assert.equal(calls, 0);
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 12, usage: { inputTokens: 100, outputTokens: 20 }, actualCalculatedCostUsd: 0.0004, pricingEffectiveDate: "1970-01-01" }, proposal: { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md"] } });
});

test("execution-decision CLI propagates bounded provider failure", async () => {
  const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => { throw new ExecutionDecisionProviderFailure({ status: "failed", provider: "anthropic_api", model: "claude-sonnet-5", code: "provider_rate_limited", message: "private", durationMs: 31, truncated: false, httpStatus: 429, providerErrorType: "rate_limit_error" }); } });
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "failed", code: "provider_rate_limited", model: "claude-sonnet-5", durationMs: 31, httpStatus: 429, providerErrorType: "rate_limit_error" } });
});

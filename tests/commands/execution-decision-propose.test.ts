import assert from "node:assert/strict";
import { test } from "node:test";
import { runExecutionDecisionProposal } from "../../src/composition/execution-decision-proposal.js";
import { ExecutionDecisionProviderFailure } from "../../src/governance/execution-decision-provider.js";
import {
  calculateCostUsd,
  resolveAnthropicPricing,
} from "../../src/text-only-provider/index.js";

const sha = "a".repeat(40);
const current = { project: "lp-infra", projectPath: "/tmp/lp", candidateId: "H4-L1", sourceDocument: "docs/roadmap.md", gitHead: sha, executionDecisionPath: ".governance/execution-decision.yaml", projectConfig: {} } as never;
const input = { project: "lp-infra", candidateId: "H4-L1", sourceDocument: "docs/roadmap.md", gitHead: sha, provider: "anthropic_api" as const, model: "claude-sonnet-5" as const, effort: "low" as const, timeoutMs: 60_000 as const };
const currentSonnetPricing = resolveAnthropicPricing(input.model);
assert.ok(currentSonnetPricing);
const currentPricingMetadata =
  currentSonnetPricing.effectiveFrom === "1970-01-01"
    ? {}
    : { pricingEffectiveDate: currentSonnetPricing.effectiveFrom };

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
  const report = await runExecutionDecisionProposal(input, { current: () => current, createProvider: () => ({ invoke: async () => { calls++; throw new Error("injected proposer owns this"); } }), propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 12, usage: { inputTokens: 100, outputTokens: 20 }, proposal: { objective: "ADR", deliverables: ["ADR", "Update candidate state"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md", "docs/roadmap.md"] } }) });
  assert.equal(calls, 0);
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 12, usage: { inputTokens: 100, outputTokens: 20 }, actualCalculatedCostUsd: calculateCostUsd(100, 20, currentSonnetPricing), ...currentPricingMetadata }, proposal: { objective: "ADR", deliverables: ["ADR", "Update candidate state"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md", "docs/roadmap.md"] } });
});

test("execution-decision CLI rejects directory provider scopes without widening them", async () => {
  for (const allowedPaths of [["docs/adr/"], ["docs/roadmap/"]]) {
    const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 1, proposal: { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths } }) });
    assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "failed", code: "decision_draft_invalid", model: "claude-sonnet-5", durationMs: 1, draftValidationIssue: "allowed_paths_invalid" } });
  }
});

test("execution-decision CLI preserves invalid-draft telemetry without exposing the rejected proposal", async () => {
  const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 6041, usage: { inputTokens: 671, outputTokens: 369 }, proposal: { objective: "ADR architecture cockpit", deliverables: ["ADR"], outOfScope: ["implementation"], allowedPaths: ["docs/roadmap/projet-lp-infra.md", "docs/adr/", "docs/roadmap/"], forbiddenContentTerms: [] } }) });
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "failed", code: "decision_draft_invalid", model: "claude-sonnet-5", durationMs: 6041, usage: { inputTokens: 671, outputTokens: 369 }, actualCalculatedCostUsd: calculateCostUsd(671, 369, currentSonnetPricing), ...currentPricingMetadata, draftValidationIssue: "allowed_paths_invalid" } });
  assert.equal("proposal" in report, false);
});

test("execution-decision CLI accepts exact LP-INFRA-like paths while omitting empty forbidden terms", async () => {
  const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 1, proposal: { objective: "ADR architecture cockpit", deliverables: ["ADR", "Update candidate state"], outOfScope: ["implementation"], allowedPaths: ["ADR/0007-architecture-cockpit.md", "docs/roadmap.md"] } }) });
  assert.equal(report.result.status, "completed");
  if (report.result.status === "completed") assert.equal("forbiddenContentTerms" in report.proposal, false);
});

test("execution-decision CLI rejects an otherwise valid scope that omits the candidate source document", async () => {
  const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 1, proposal: { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths: ["ADR/0007-architecture-cockpit.md"] } }) });
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "failed", code: "decision_draft_invalid", model: "claude-sonnet-5", durationMs: 1, draftValidationIssue: "allowed_paths_invalid" } });
});

test("execution-decision CLI accepts exact files and terminal recursive scopes only when the candidate source remains explicit", async () => {
  for (const artifactScope of ["docs/adr/0007-cockpit-architecture.md", "docs/adr/**"]) {
    const allowedPaths = [artifactScope, "docs/roadmap.md"];
    const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => ({ status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 1, proposal: { objective: "ADR", deliverables: ["ADR", "Update candidate state"], outOfScope: ["execute"], allowedPaths } }) });
    assert.equal(report.result.status, "completed");
  }
});

test("execution-decision CLI propagates bounded provider failure", async () => {
  const report = await runExecutionDecisionProposal(input, { current: () => current, propose: async () => { throw new ExecutionDecisionProviderFailure({ status: "failed", provider: "anthropic_api", model: "claude-sonnet-5", code: "provider_rate_limited", message: "private", durationMs: 31, truncated: false, httpStatus: 429, providerErrorType: "rate_limit_error" }); } });
  assert.deepEqual(report, { schemaVersion: 1, project: "lp-infra", result: { status: "failed", code: "provider_rate_limited", model: "claude-sonnet-5", durationMs: 31, httpStatus: 429, providerErrorType: "rate_limit_error" } });
});

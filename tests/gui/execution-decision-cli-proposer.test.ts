import assert from "node:assert/strict";
import { test } from "node:test";
import { createCliExecutionDecisionProposer, ExecutionDecisionCliBoundaryFailure } from "../../src/gui/desktop/execution-decision-cli-proposer.js";
import { createExecutionDecisionDraft } from "../../src/governance/execution-decision-draft.js";

const current = { project: "lp-infra", projectPath: "/runtime/lp", candidateId: "H4-L1", sourceDocument: "docs/roadmap.md", gitHead: "a".repeat(40), executionDecisionPath: ".governance/execution-decision.yaml" };
test("desktop execution-decision proposer passes only current bindings and credential env to the child", async () => {
  let args: readonly string[] = []; let env: Readonly<Record<string, string>> | undefined;
  const propose = createCliExecutionDecisionProposer({ resolveRepositoryPath: () => "/loop", keychainReader: { read: async () => ({ ok: true, apiKey: "sk-secret" }) }, cliInvoker: { invoke: async (_command, input, _cwd, environment) => { args = input; env = environment; return { ok: true, exitCode: 0, json: { schemaVersion: 1, project: "lp-infra", result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 1 }, proposal: { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md"] } } }; } } });
  assert.deepEqual(await propose(current), { objective: "ADR", deliverables: ["ADR"], outOfScope: ["execute"], allowedPaths: ["docs/adr.md"] });
  assert.deepEqual(args, ["propose", "lp-infra", "--candidate", "H4-L1", "--source-document", "docs/roadmap.md", "--git-head", "a".repeat(40), "--provider", "anthropic_api", "--provider-model", "claude-sonnet-5", "--provider-effort", "low", "--provider-timeout-ms", "60000"]);
  assert.deepEqual(env, { ANTHROPIC_API_KEY: "sk-secret" }); assert.equal(args.includes("sk-secret"), false);
});
test("desktop execution-decision proposer maps stale and malformed child JSON fail-closed", async () => {
  for (const json of [{ schemaVersion: 1, project: "lp-infra", result: { status: "stale", code: "decision_draft_stale" } }, { schemaVersion: 1, project: "lp-infra", result: { status: "completed" } }]) {
    const propose = createCliExecutionDecisionProposer({ resolveRepositoryPath: () => "/loop", keychainReader: { read: async () => ({ ok: true, apiKey: "sk-secret" }) }, cliInvoker: { invoke: async () => ({ ok: true, exitCode: 0, json }) } });
    await assert.rejects(() => propose(current), /cli_response_invalid|decision_draft_stale/);
  }
});
test("desktop execution-decision proposer accepts the real completed JSON shape before B1 validates scope", async () => {
  const json = { schemaVersion: 1, project: "lp-infra", result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", effort: "low", durationMs: 7273, usage: { inputTokens: 671, outputTokens: 369 }, actualCalculatedCostUsd: 0.005032, pricingEffectiveDate: "1970-01-01" }, proposal: { objective: "ADR architecture cockpit", deliverables: ["ADR"], outOfScope: ["implementation"], allowedPaths: ["docs/roadmap/projet-lp-infra.md", "docs/adr/", "docs/roadmap/"], forbiddenContentTerms: [] } };
  const propose = createCliExecutionDecisionProposer({ resolveRepositoryPath: () => "/loop", keychainReader: { read: async () => ({ ok: true, apiKey: "sk-secret" }) }, cliInvoker: { invoke: async () => ({ ok: true, exitCode: 0, json }) } });
  const proposal = await propose(current); assert.deepEqual(proposal.allowedPaths, ["docs/roadmap/projet-lp-infra.md", "docs/adr/", "docs/roadmap/"]);
  const draft = createExecutionDecisionDraft(current, proposal); assert.equal(draft.ok, false); if (!draft.ok) assert.equal(draft.code, "decision_draft_invalid");
});
test("desktop execution-decision proposer distinguishes malformed JSON, spawn failure, and timeout", async () => {
  const cases: readonly [unknown, "cli_response_invalid" | "cli_spawn_failed" | "cli_timeout"][] = [[{ schemaVersion: 1, project: "lp-infra", result: { status: "completed" } }, "cli_response_invalid"], [{ ok: false, kind: "spawn-error", raw: "sk-secret" }, "cli_spawn_failed"], [{ ok: false, kind: "timeout", raw: "sk-secret" }, "cli_timeout"]];
  for (const [value, code] of cases) {
    const propose = createCliExecutionDecisionProposer({ resolveRepositoryPath: () => "/loop", keychainReader: { read: async () => ({ ok: true, apiKey: "sk-secret" }) }, cliInvoker: { invoke: async () => (typeof value === "object" && value !== null && "ok" in value ? value : { ok: true, exitCode: 0, json: value }) as never } });
    await assert.rejects(() => propose(current), (error: unknown) => error instanceof ExecutionDecisionCliBoundaryFailure && error.code === code);
  }
});

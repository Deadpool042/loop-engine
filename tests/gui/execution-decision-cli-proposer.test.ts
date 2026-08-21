import assert from "node:assert/strict";
import { test } from "node:test";
import { createCliExecutionDecisionProposer } from "../../src/gui/desktop/execution-decision-cli-proposer.js";

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
    await assert.rejects(() => propose(current), /Execution decision provider failed|decision_draft_stale/);
  }
});

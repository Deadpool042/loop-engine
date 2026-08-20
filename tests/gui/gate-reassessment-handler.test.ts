import assert from "node:assert/strict";
import test from "node:test";
import { createGateReassessmentHandler } from "../../src/gui/desktop/gate-reassessment-handler.js";

test("gate reassessment accepts only projectName plus the closed override and maps it in main", async () => {
  const calls: unknown[][] = []; let credentialReads = 0;
  const handler = createGateReassessmentHandler({ cliInvoker: { invoke: async (command, args) => { calls.push([command, ...args]); return { ok: true, json: {}, exitCode: 0 }; } }, resolveRepositoryPath: () => "/trusted", keychainReader: { read: async () => { credentialReads++; return { ok: true, apiKey: "secret" }; } } });
  await handler("lp-infra", "deep");
  assert.deepEqual(calls, [["roadmap", "reassess-gates", "lp-infra", "--provider", "anthropic_api", "--provider-model", "claude-sonnet-5", "--provider-effort", "medium", "--provider-timeout-ms", "60000"]]);
  const invalid = await handler("lp-infra", { model: "claude-opus", effort: "max", provider: "x", openGate: true });
  assert.equal(invalid.ok, false); assert.equal(credentialReads, 1);
});
test("estimate handler has no provider/keychain path", async () => {
  let calls = 0;
  const { createGateReassessmentEstimateHandler } = await import("../../src/gui/desktop/gate-reassessment-estimate-handler.js");
  const handler = createGateReassessmentEstimateHandler({ cliInvoker: { invoke: async (_command, args) => { calls++; assert.deepEqual(args, ["reassess-gates-estimate", "lp-infra"]); return { ok: true, json: {}, exitCode: 0 }; } }, resolveRepositoryPath: () => "/trusted" });
  await handler("lp-infra"); assert.equal(calls, 1);
});

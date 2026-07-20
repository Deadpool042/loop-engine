import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectSimulatedRuntimeAdapterInvariant,
  SIMULATED_RUNTIME_ADAPTER_CONTRACT_RULE,
  SIMULATED_RUNTIME_ADAPTER_DETERMINISM_RULE,
  SIMULATED_RUNTIME_ADAPTER_DOCUMENT_RULE,
  SIMULATED_RUNTIME_ADAPTER_INVARIANTS,
  SIMULATED_RUNTIME_ADAPTER_PLAN_BOUNDARY_RULE,
  SIMULATED_RUNTIME_ADAPTER_PUBLIC_API_RULE,
  SIMULATED_RUNTIME_ADAPTER_REGISTRY_RULE,
} from "../../src/audit/rules/audit.js";

const cases = [
  { rule: SIMULATED_RUNTIME_ADAPTER_CONTRACT_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.contract },
  { rule: SIMULATED_RUNTIME_ADAPTER_DETERMINISM_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.deterministic },
  { rule: SIMULATED_RUNTIME_ADAPTER_REGISTRY_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.registry },
  { rule: SIMULATED_RUNTIME_ADAPTER_PUBLIC_API_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.publicApi },
  { rule: SIMULATED_RUNTIME_ADAPTER_PLAN_BOUNDARY_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.planBoundary },
  { rule: SIMULATED_RUNTIME_ADAPTER_DOCUMENT_RULE, invariant: SIMULATED_RUNTIME_ADAPTER_INVARIANTS.documentation },
] as const;

test("V13.18 simulated RuntimeAdapter audit rules are contiguous and pass", () => {
  assert.deepEqual(cases.map(({ rule }) => rule.id), ["AUDIT-400", "AUDIT-401", "AUDIT-402", "AUDIT-403", "AUDIT-404", "AUDIT-405"]);
  assert.ok(cases.every(({ rule }) => rule.check().status === "pass"));
});

for (const { rule, invariant } of cases) {
  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    const source = readFileSync(invariant.file, "utf8").replaceAll(invariant.requiredTokens[0], "removed-invariant");
    const result = inspectSimulatedRuntimeAdapterInvariant(source, invariant);
    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-401 rejects platform effects in the simulated adapter", () => {
  const invariant = SIMULATED_RUNTIME_ADAPTER_INVARIANTS.deterministic;
  const source = `${readFileSync(invariant.file, "utf8")}\nDate.now();\nconsole.log('debug');\n`;
  assert.deepEqual(inspectSimulatedRuntimeAdapterInvariant(source, invariant).forbidden, ["Date.now", "console."]);
});

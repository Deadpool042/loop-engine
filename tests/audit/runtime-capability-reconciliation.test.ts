import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeCapabilityReconciliationInvariant,
  RUNTIME_CAPABILITY_CONTRACT_SEPARATION_RULE,
  RUNTIME_CAPABILITY_CORE_EXPORT_RULE,
  RUNTIME_CAPABILITY_PURE_EVALUATION_RULE,
  RUNTIME_CAPABILITY_RECONCILIATION_DOCUMENT_RULE,
  RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS,
  RUNTIME_CAPABILITY_SELECTION_BOUNDARY_RULE,
} from "../../src/audit/rules/audit.js";

const cases = [
  {
    rule: RUNTIME_CAPABILITY_CONTRACT_SEPARATION_RULE,
    invariant: RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.contracts,
  },
  {
    rule: RUNTIME_CAPABILITY_PURE_EVALUATION_RULE,
    invariant: RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.evaluation,
  },
  {
    rule: RUNTIME_CAPABILITY_SELECTION_BOUNDARY_RULE,
    invariant: RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.selection,
  },
  {
    rule: RUNTIME_CAPABILITY_CORE_EXPORT_RULE,
    invariant: RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.coreExports,
  },
  {
    rule: RUNTIME_CAPABILITY_RECONCILIATION_DOCUMENT_RULE,
    invariant: RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.documentation,
  },
] as const;

for (const { rule, invariant } of cases) {
  test(`${rule.id} accepts its positive repository fixture`, () => {
    const source = readFileSync(invariant.file, "utf8");
    assert.deepEqual(
      inspectRuntimeCapabilityReconciliationInvariant(source, invariant),
      { missing: [], forbidden: [] },
    );
    assert.equal(rule.check().status, "pass");
  });

  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeCapabilityReconciliationInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-380 rejects an execution dependency", () => {
  const invariant = RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.selection;
  const source = `${readFileSync(invariant.file, "utf8")}\nexecuteRuntime(request);`;

  assert.deepEqual(
    inspectRuntimeCapabilityReconciliationInvariant(source, invariant)
      .forbidden,
    ["executeRuntime("],
  );
});

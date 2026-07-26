import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeRuleInventoryNormalizationInvariant,
  RUNTIME_RULE_INVENTORY_NORMALIZATION_INVARIANTS,
  RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE,
} from "../../src/audit/rules/runtime-rule-inventory-normalization.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("AUDIT-424 protects composite runtime audit inventory normalization", () => {
  assert.equal(RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE.id, "AUDIT-424");
  assert.equal(RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE.check().status, "pass");
});

test("AUDIT-424 is registered after AUDIT-423 with complete metadata", () => {
  const audit423Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-423");
  const audit424Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-424");
  const audit424 = AUDIT_RULES[audit424Index];

  assert.notEqual(audit423Index, -1);
  assert.equal(audit424Index, audit423Index + 1);
  assert.ok(audit424);
  assert.equal(audit424.metadata.introducedIn, "V13.83");
  assert.deepEqual(audit424.metadata.dependsOn, ["AUDIT-423"]);
  assert.equal(audit424.metadata.stability, "stable");
});

for (const [name, invariant] of Object.entries(
  RUNTIME_RULE_INVENTORY_NORMALIZATION_INVARIANTS,
)) {
  test(`AUDIT-424 rejects ${name} when a required normalization token is missing`, () => {
    if (invariant.requiredTokens.length === 0) return;

    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeRuleInventoryNormalizationInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });

  test(`AUDIT-424 rejects ${name} when a forbidden regression token is present`, () => {
    if (invariant.forbiddenTokens.length === 0) return;

    const source = `${readFileSync(invariant.file, "utf8")}\n${invariant.forbiddenTokens[0]}\n`;
    const result = inspectRuntimeRuleInventoryNormalizationInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.forbidden, [invariant.forbiddenTokens[0]]);
  });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeExecutionPublicResultFacadeInvariant,
  RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_INVARIANTS,
  RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE,
} from "../../src/audit/rules/runtime-execution-public-result-facade.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("AUDIT-423 protects the Runtime execution public result facade", () => {
  assert.equal(RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE.id, "AUDIT-423");
  assert.equal(RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE.check().status, "pass");
});

test("AUDIT-423 is registered after AUDIT-422", () => {
  const audit422Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-422");
  const audit423Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-423");

  assert.notEqual(audit422Index, -1);
  assert.equal(audit423Index, audit422Index + 1);
});

for (const [name, invariant] of Object.entries(
  RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_INVARIANTS,
)) {
  test(`AUDIT-423 rejects ${name} when a required invariant is missing`, () => {
    if (invariant.requiredTokens.length === 0) return;

    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeExecutionPublicResultFacadeInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });

  test(`AUDIT-423 rejects ${name} when a forbidden token is present`, () => {
    if (invariant.forbiddenTokens.length === 0) return;

    const source = `${readFileSync(invariant.file, "utf8")}\n${invariant.forbiddenTokens[0]}\n`;
    const result = inspectRuntimeExecutionPublicResultFacadeInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.forbidden, [invariant.forbiddenTokens[0]]);
  });
}

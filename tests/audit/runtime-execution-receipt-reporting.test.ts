import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";
import {
  inspectRuntimeExecutionReceiptReportingInvariant,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_INVARIANTS,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE,
} from "../../src/audit/rules/runtime-execution-receipt-reporting.js";

test("AUDIT-421 protects the additive Runtime receipt reporting boundary", () => {
  assert.equal(RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE.id, "AUDIT-421");
  assert.equal(RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE.check().status, "pass");
});

test("AUDIT-421 is registered in the operational audit inventory", () => {
  assert.equal(AUDIT_RULES.at(-1)?.id, "AUDIT-421");
  assert.equal(
    AUDIT_RULES.filter((rule) => rule.id === "AUDIT-421").length,
    1,
  );
});

for (const [name, invariant] of Object.entries(
  RUNTIME_EXECUTION_RECEIPT_REPORTING_INVARIANTS,
)) {
  test(`AUDIT-421 rejects ${name} when a required invariant is missing`, () => {
    if (invariant.requiredTokens.length === 0) return;

    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeExecutionReceiptReportingInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });

  test(`AUDIT-421 rejects ${name} when a forbidden token is present`, () => {
    if (invariant.forbiddenTokens.length === 0) return;

    const source = `${readFileSync(invariant.file, "utf8")}\n${invariant.forbiddenTokens[0]}\n`;
    const result = inspectRuntimeExecutionReceiptReportingInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.forbidden, [invariant.forbiddenTokens[0]]);
  });
}

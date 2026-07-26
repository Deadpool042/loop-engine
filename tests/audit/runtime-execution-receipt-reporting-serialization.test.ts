import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";
import {
  inspectRuntimeExecutionReceiptReportingSerializationInvariant,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_INVARIANTS,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE,
} from "../../src/audit/rules/runtime-execution-receipt-reporting-serialization.js";

test("AUDIT-422 protects the public Runtime receipt reporting serialization boundary", () => {
  assert.equal(
    RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE.id,
    "AUDIT-422",
  );
  assert.equal(
    RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE.check().status,
    "pass",
  );
});

test("AUDIT-422 is registered after AUDIT-421", () => {
  const ids = AUDIT_RULES.map((rule) => rule.id);
  const audit421Index = ids.indexOf("AUDIT-421");
  const audit422Index = ids.indexOf("AUDIT-422");

  assert.ok(audit421Index >= 0);
  assert.equal(audit422Index, audit421Index + 1);
});

for (const [name, invariant] of Object.entries(
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_INVARIANTS,
)) {
  test(`AUDIT-422 rejects ${name} when a required invariant is missing`, () => {
    if (invariant.requiredTokens.length === 0) return;

    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result =
      inspectRuntimeExecutionReceiptReportingSerializationInvariant(
        source,
        invariant,
      );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });

  test(`AUDIT-422 rejects ${name} when a forbidden token is present`, () => {
    if (invariant.forbiddenTokens.length === 0) return;

    const source = `${readFileSync(invariant.file, "utf8")}\n${invariant.forbiddenTokens[0]}\n`;
    const result =
      inspectRuntimeExecutionReceiptReportingSerializationInvariant(
        source,
        invariant,
      );

    assert.deepEqual(result.forbidden, [invariant.forbiddenTokens[0]]);
  });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeExecutionReceiptInvariant,
  RUNTIME_EXECUTION_RECEIPT_COMPAT_RULE,
  RUNTIME_EXECUTION_RECEIPT_CONTRACT_RULE,
  RUNTIME_EXECUTION_RECEIPT_DOCUMENT_RULE,
  RUNTIME_EXECUTION_RECEIPT_EXECUTION_RULE,
  RUNTIME_EXECUTION_RECEIPT_INVARIANTS,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_BOUNDARY_RULE,
  RUNTIME_EXECUTION_RECEIPT_SERIALIZATION_RULE,
} from "../../src/audit/rules/audit.js";

const cases = [
  { rule: RUNTIME_EXECUTION_RECEIPT_CONTRACT_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.contract },
  { rule: RUNTIME_EXECUTION_RECEIPT_SERIALIZATION_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.serialization },
  { rule: RUNTIME_EXECUTION_RECEIPT_EXECUTION_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.execution },
  { rule: RUNTIME_EXECUTION_RECEIPT_COMPAT_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.compatibility },
  { rule: RUNTIME_EXECUTION_RECEIPT_REPORTING_BOUNDARY_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.executionReportBoundary },
  { rule: RUNTIME_EXECUTION_RECEIPT_DOCUMENT_RULE, invariant: RUNTIME_EXECUTION_RECEIPT_INVARIANTS.documentation },
] as const;

test("V13.19 Runtime Execution Receipt audit rules are contiguous and pass", () => {
  assert.deepEqual(cases.map(({ rule }) => rule.id), ["AUDIT-406", "AUDIT-407", "AUDIT-408", "AUDIT-409", "AUDIT-410", "AUDIT-411"]);
  assert.ok(cases.every(({ rule }) => rule.check().status === "pass"));
});

for (const { rule, invariant } of cases) {
  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    if (invariant.requiredTokens.length === 0) return;
    const source = readFileSync(invariant.file, "utf8").replaceAll(invariant.requiredTokens[0], "removed-invariant");
    const result = inspectRuntimeExecutionReceiptInvariant(source, invariant);
    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-407 rejects clock and random source fixtures", () => {
  const invariant = RUNTIME_EXECUTION_RECEIPT_INVARIANTS.serialization;
  const source = `${readFileSync(invariant.file, "utf8")}\nDate.now();\nMath.random();\n`;
  assert.deepEqual(inspectRuntimeExecutionReceiptInvariant(source, invariant).forbidden, ["Date.now", "Math.random"]);
});

test("AUDIT-408 requires the post-adapter receipt boundary", () => {
  const invariant = RUNTIME_EXECUTION_RECEIPT_INVARIANTS.execution;
  const source = readFileSync(invariant.file, "utf8").replaceAll("createRuntimeExecutionReceipt({", "removedReceiptFactory({");
  assert.deepEqual(inspectRuntimeExecutionReceiptInvariant(source, invariant).missing, ["createRuntimeExecutionReceipt({"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectAuditRuleIdIntegrity,
  AUDIT_RULE_ID_SEQUENCE_RULE,
} from "../../src/audit/rules/audit.js";
import { AUDIT_RULES } from "../../src/audit/rules.js";

test("AUDIT-029 passes on the registered audit inventory and includes AUDIT-420", () => {
  const report = inspectAuditRuleIdIntegrity(AUDIT_RULES);

  assert.equal(AUDIT_RULE_ID_SEQUENCE_RULE.check().status, "pass");
  assert.deepEqual(report.invalidIds, []);
  assert.deepEqual(report.duplicateIds, []);
  assert.deepEqual(report.missingIds, []);
  assert.equal(report.hasAudit420, true);
});

test("AUDIT-029 detects duplicate audit rule ids", () => {
  const report = inspectAuditRuleIdIntegrity([
    { id: "AUDIT-001" },
    { id: "AUDIT-001" },
  ]);

  assert.deepEqual(report.duplicateIds, ["AUDIT-001"]);
});

test("AUDIT-029 detects gaps in the audit rule id sequence", () => {
  const report = inspectAuditRuleIdIntegrity([
    { id: "AUDIT-001" },
    { id: "AUDIT-003" },
  ]);

  assert.deepEqual(report.missingIds, ["AUDIT-002"]);
});

test("AUDIT-029 detects invalid audit rule ids", () => {
  const report = inspectAuditRuleIdIntegrity([
    { id: "AUDIT-001" },
    { id: "AUDIT-12X" },
  ]);

  assert.deepEqual(report.invalidIds, ["AUDIT-12X"]);
});

test("AUDIT-029 detects out-of-order ids", () => {
  const report = inspectAuditRuleIdIntegrity([
    { id: "AUDIT-001" },
    { id: "AUDIT-003" },
    { id: "AUDIT-002" },
  ]);

  assert.deepEqual(report.outOfOrderIds, ["AUDIT-002"]);
});

test("AUDIT-029 accepts ids supplied through a constant binding", () => {
  const audit420Id = "AUDIT-420" as const;
  const report = inspectAuditRuleIdIntegrity(
    [
      { id: "AUDIT-419" },
      { id: audit420Id },
      { id: "AUDIT-421" },
    ],
    419,
  );

  assert.equal(report.hasAudit420, true);
  assert.deepEqual(report.invalidIds, []);
  assert.deepEqual(report.duplicateIds, []);
  assert.deepEqual(report.outOfOrderIds, []);
  assert.deepEqual(report.missingIds, []);
});

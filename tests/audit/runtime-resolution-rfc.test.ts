import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUDIT_RULE_METADATA_COMPLETENESS_RULE,
  RUNTIME_RESOLUTION_DIAGNOSTICS_RULE,
  RUNTIME_RESOLUTION_DOCUMENT_RULE,
  RUNTIME_RESOLUTION_IMMUTABLE_RULE,
  RUNTIME_RESOLUTION_MODULE_RULE,
  RUNTIME_RESOLUTION_NO_SURFACE_RULE,
  RUNTIME_RESOLUTION_NON_OPERATIONAL_RULE,
  RUNTIME_RESOLUTION_REQUEST_RULE,
  RUNTIME_RESOLUTION_TIME_RULE,
} from "../../src/audit/rules/audit.js";

test("Runtime Resolution audit rules are registered and complete", () => {
  const rules = [
    RUNTIME_RESOLUTION_MODULE_RULE,
    RUNTIME_RESOLUTION_IMMUTABLE_RULE,
    RUNTIME_RESOLUTION_REQUEST_RULE,
    RUNTIME_RESOLUTION_NON_OPERATIONAL_RULE,
    RUNTIME_RESOLUTION_DIAGNOSTICS_RULE,
    RUNTIME_RESOLUTION_TIME_RULE,
    RUNTIME_RESOLUTION_DOCUMENT_RULE,
    RUNTIME_RESOLUTION_NO_SURFACE_RULE,
  ];

  assert.deepEqual(rules.map((rule) => rule.id), [
    "AUDIT-346",
    "AUDIT-347",
    "AUDIT-348",
    "AUDIT-349",
    "AUDIT-350",
    "AUDIT-351",
    "AUDIT-352",
    "AUDIT-353",
  ]);
  assert.ok(rules.every((rule) => rule.check().status === "pass"));
  assert.equal(AUDIT_RULE_METADATA_COMPLETENESS_RULE.check().status, "pass");
});

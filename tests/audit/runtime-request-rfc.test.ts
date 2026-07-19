import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUDIT_RULE_METADATA_COMPLETENESS_RULE,
  RUNTIME_REQUEST_BRIDGE_RULE,
  RUNTIME_REQUEST_DIAGNOSTICS_RULE,
  RUNTIME_REQUEST_DOCUMENT_RULE,
  RUNTIME_REQUEST_IMMUTABLE_RULE,
  RUNTIME_REQUEST_MODULE_RULE,
  RUNTIME_REQUEST_NO_SURFACE_RULE,
  RUNTIME_REQUEST_NON_OPERATIONAL_RULE,
  RUNTIME_REQUEST_TIME_RULE,
} from "../../src/audit/rules/audit.js";

test("Runtime Request audit rules are registered and complete", () => {
  const rules = [
    RUNTIME_REQUEST_MODULE_RULE,
    RUNTIME_REQUEST_IMMUTABLE_RULE,
    RUNTIME_REQUEST_BRIDGE_RULE,
    RUNTIME_REQUEST_NON_OPERATIONAL_RULE,
    RUNTIME_REQUEST_DIAGNOSTICS_RULE,
    RUNTIME_REQUEST_TIME_RULE,
    RUNTIME_REQUEST_DOCUMENT_RULE,
    RUNTIME_REQUEST_NO_SURFACE_RULE,
  ];

  assert.deepEqual(rules.map((rule) => rule.id), [
    "AUDIT-338",
    "AUDIT-339",
    "AUDIT-340",
    "AUDIT-341",
    "AUDIT-342",
    "AUDIT-343",
    "AUDIT-344",
    "AUDIT-345",
  ]);
  assert.ok(rules.every((rule) => rule.check().status === "pass"));
  assert.equal(AUDIT_RULE_METADATA_COMPLETENESS_RULE.check().status, "pass");
});

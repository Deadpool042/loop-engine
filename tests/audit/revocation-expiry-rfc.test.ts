import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHORITY_LIFECYCLE_RFC_CONTRACT_RULE, AUTHORITY_LIFECYCLE_RFC_DOCUMENT_RULE, AUTHORITY_LIFECYCLE_RFC_EVALUATION_RULE, AUTHORITY_LIFECYCLE_RFC_MODULE_RULE } from "../../src/audit/rules/audit.js";
test("V13.3 lifecycle audit rules are registered and pass", () => { const rules = [AUTHORITY_LIFECYCLE_RFC_MODULE_RULE, AUTHORITY_LIFECYCLE_RFC_CONTRACT_RULE, AUTHORITY_LIFECYCLE_RFC_EVALUATION_RULE, AUTHORITY_LIFECYCLE_RFC_DOCUMENT_RULE]; assert.deepEqual(rules.map((rule) => rule.id), ["AUDIT-310", "AUDIT-311", "AUDIT-312", "AUDIT-313"]); assert.ok(rules.every((rule) => rule.check().status === "pass")); });

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INBOUND_SECURITY_CONTRACT_INVARIANTS,
  INBOUND_SECURITY_CONTRACT_RULE,
  inspectInboundSecurityContractInvariant,
} from "../../src/audit/rules/inbound-security-contract.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("AUDIT-426 protects the inbound security contract", () => {
  assert.equal(INBOUND_SECURITY_CONTRACT_RULE.id, "AUDIT-426");
  assert.equal(INBOUND_SECURITY_CONTRACT_RULE.check().status, "pass");
});

test("AUDIT-426 is registered after AUDIT-425 with complete metadata", () => {
  const audit425Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-425");
  const audit426Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-426");
  const audit426 = AUDIT_RULES[audit426Index];

  assert.notEqual(audit425Index, -1);
  assert.equal(audit426Index, audit425Index + 1);
  assert.ok(audit426);
  assert.equal(audit426.metadata.introducedIn, "V14.0a");
  assert.deepEqual(audit426.metadata.dependsOn, ["AUDIT-425"]);
  assert.equal(audit426.metadata.stability, "stable");
});

for (const [name, invariant] of Object.entries(INBOUND_SECURITY_CONTRACT_INVARIANTS)) {
  test(`AUDIT-426 rejects ${name} when a required token is missing`, () => {
    if (invariant.requiredTokens.length === 0) return;

    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectInboundSecurityContractInvariant(source, invariant);

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });

  test(`AUDIT-426 rejects ${name} when a forbidden token is present`, () => {
    if (invariant.forbiddenTokens.length === 0) return;

    const source = `${readFileSync(invariant.file, "utf8")}\n${invariant.forbiddenTokens[0]}\n`;
    const result = inspectInboundSecurityContractInvariant(source, invariant);

    assert.deepEqual(result.forbidden, [invariant.forbiddenTokens[0]]);
  });
}

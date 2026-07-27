import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INBOUND_SECURITY_GATE_RULE,
  inspectInboundSecurityGateInvariant,
} from "../../src/audit/rules/inbound-security-gate.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const GATE_FILE = "src/core/inbound-security.ts";

test("AUDIT-427 protects the inbound security gate", () => {
  assert.equal(INBOUND_SECURITY_GATE_RULE.id, "AUDIT-427");
  assert.equal(INBOUND_SECURITY_GATE_RULE.check().status, "pass");
});

test("AUDIT-427 is registered after AUDIT-426 with complete metadata", () => {
  const audit426Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-426");
  const audit427Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-427");
  const audit427 = AUDIT_RULES[audit427Index];

  assert.notEqual(audit426Index, -1);
  assert.equal(audit427Index, audit426Index + 1);
  assert.ok(audit427);
  assert.equal(audit427.metadata.introducedIn, "V14.0a");
  assert.deepEqual(audit427.metadata.dependsOn, ["AUDIT-426"]);
  assert.equal(audit427.metadata.stability, "stable");
});

test("AUDIT-427 detects a missing deny-check token", () => {
  const source = readFileSync(GATE_FILE, "utf8").replaceAll(
    'if (decision.kind !== "allow") {',
    "removed-invariant",
  );
  const result = inspectInboundSecurityGateInvariant(source);

  assert.deepEqual(result.missing, ['if (decision.kind !== "allow") {']);
});

test("AUDIT-427 detects an unconditional downstream preparation call", () => {
  const source = `${readFileSync(GATE_FILE, "utf8")}\nprepareAuthorizedLoopRuntimeDecodedRequest(input)\n`;
  const result = inspectInboundSecurityGateInvariant(source);

  assert.deepEqual(result.forbidden, ["prepareAuthorizedLoopRuntimeDecodedRequest(input)"]);
});

test("AUDIT-427 detects downstream preparation invoked before the deny/indeterminate check", () => {
  const original = readFileSync(GATE_FILE, "utf8");
  const reordered = `await authorizeLoopRuntimePublicRequest();\n${original}`;

  const result = inspectInboundSecurityGateInvariant(reordered);

  assert.equal(result.gatesBeforePreparation, false);
});

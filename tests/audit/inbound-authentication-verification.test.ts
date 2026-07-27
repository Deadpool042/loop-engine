import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INBOUND_AUTHENTICATION_VERIFICATION_RULE,
  inspectInboundAuthenticationVerificationInvariant,
} from "../../src/audit/rules/inbound-authentication-verification.js";
import {
  INBOUND_AUTHENTICATION_GATE_RULE,
  inspectInboundAuthenticationGateInvariant,
} from "../../src/audit/rules/inbound-authentication-gate.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const VERIFICATION_FILE = "src/inbound-security/authentication-verification.ts";
const GATE_FILE = "src/core/inbound-authentication.ts";

test("AUDIT-428 protects the injected authentication verification boundary", () => {
  assert.equal(INBOUND_AUTHENTICATION_VERIFICATION_RULE.id, "AUDIT-428");
  assert.equal(INBOUND_AUTHENTICATION_VERIFICATION_RULE.check().status, "pass");
});

test("AUDIT-429 protects authentication-before-security ordering", () => {
  assert.equal(INBOUND_AUTHENTICATION_GATE_RULE.id, "AUDIT-429");
  assert.equal(INBOUND_AUTHENTICATION_GATE_RULE.check().status, "pass");
});

test("AUDIT-428 and AUDIT-429 are registered contiguously after V14.0a", () => {
  const indexes = ["AUDIT-427", "AUDIT-428", "AUDIT-429"].map((id) =>
    AUDIT_RULES.findIndex((rule) => rule.id === id),
  );

  assert.notEqual(indexes[0], -1);
  assert.equal(indexes[1], indexes[0] + 1);
  assert.equal(indexes[2], indexes[1] + 1);
  assert.equal(AUDIT_RULES[indexes[1]]?.metadata.introducedIn, "V14.0b");
  assert.equal(AUDIT_RULES[indexes[2]]?.metadata.introducedIn, "V14.0b");
  assert.deepEqual(AUDIT_RULES[indexes[1]]?.metadata.dependsOn, ["AUDIT-427"]);
  assert.deepEqual(AUDIT_RULES[indexes[2]]?.metadata.dependsOn, ["AUDIT-428"]);
});

test("AUDIT-428 detects missing and forbidden verification tokens", () => {
  const source = readFileSync(VERIFICATION_FILE, "utf8");
  const missing = inspectInboundAuthenticationVerificationInvariant(
    source.replace("export type InboundAuthenticationVerifier", "removed-verifier"),
  );
  const forbidden = inspectInboundAuthenticationVerificationInvariant(
    `${source}\nprocess.env.SECRET\n`,
  );

  assert.deepEqual(missing.missing, ["export type InboundAuthenticationVerifier"]);
  assert.deepEqual(forbidden.forbidden, ["process.env"]);
});

test("AUDIT-429 detects verification ordering regressions", () => {
  const source = readFileSync(GATE_FILE, "utf8");
  const securityCall = "await evaluateInboundSecurityAndPrepareLoopRuntimeRequest(";
  const verificationCall = "await evaluateInboundAuthenticationVerifier(";
  const reordered = source.replace(verificationCall, "verification-placeholder(").replace(
    securityCall,
    verificationCall,
  ).replace("verification-placeholder(", securityCall);

  const result = inspectInboundAuthenticationGateInvariant(reordered);
  assert.equal(result.verificationBeforeSecurity, false);
});

test("AUDIT-429 rejects bypasses to lower-level preparation", () => {
  const source = `${readFileSync(GATE_FILE, "utf8")}\nprepareAuthorizedLoopRuntimeRequest(unsafe)\n`;
  const result = inspectInboundAuthenticationGateInvariant(source);

  assert.deepEqual(result.forbidden, ["prepareAuthorizedLoopRuntimeRequest("]);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE,
  inspectInboundRequestHandlerNeutralityInvariant,
} from "../../src/audit/rules/inbound-request-handler-neutrality.js";
import {
  INBOUND_REQUEST_HANDLER_GATE_RULE,
  inspectInboundRequestHandlerGateInvariant,
} from "../../src/audit/rules/inbound-request-handler-gate.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("AUDIT-430 protects transport neutrality of the inbound handler", () => {
  assert.equal(INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE.id, "AUDIT-430");
  assert.equal(INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE.check().status, "pass");
});

test("AUDIT-431 protects the validate-then-verify composition order", () => {
  assert.equal(INBOUND_REQUEST_HANDLER_GATE_RULE.id, "AUDIT-431");
  assert.equal(INBOUND_REQUEST_HANDLER_GATE_RULE.check().status, "pass");
});

test("AUDIT-430 and AUDIT-431 are registered contiguously after V14.0b", () => {
  const indexes = ["AUDIT-429", "AUDIT-430", "AUDIT-431"].map((id) =>
    AUDIT_RULES.findIndex((rule) => rule.id === id),
  );

  assert.notEqual(indexes[0], -1);
  assert.equal(indexes[1], indexes[0] + 1);
  assert.equal(indexes[2], indexes[1] + 1);
  assert.equal(AUDIT_RULES[indexes[1]]?.metadata.introducedIn, "V14.0c");
  assert.equal(AUDIT_RULES[indexes[2]]?.metadata.introducedIn, "V14.0c");
  assert.deepEqual(AUDIT_RULES[indexes[1]]?.metadata.dependsOn, ["AUDIT-429"]);
  assert.deepEqual(AUDIT_RULES[indexes[2]]?.metadata.dependsOn, ["AUDIT-430"]);
});

test("neutrality invariant flags a forbidden transport token", () => {
  const result = inspectInboundRequestHandlerNeutralityInvariant(
    "export type InboundLoopRuntimeRequestEnvelope = Readonly<{}>;\nexpress();",
  );
  assert.ok(result.forbidden.includes("express("));
});

test("gate invariant flags a direct low-level bypass call", () => {
  const result = inspectInboundRequestHandlerGateInvariant(
    "await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({});\nevaluateInboundSecurity({});",
  );
  assert.ok(result.forbidden.includes("evaluateInboundSecurity("));
});

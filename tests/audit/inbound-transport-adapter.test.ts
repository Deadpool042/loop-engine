import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE,
  inspectInboundTransportAdapterNeutralityInvariant,
} from "../../src/audit/rules/inbound-transport-adapter-neutrality.js";
import {
  INBOUND_TRANSPORT_ADAPTER_GATE_RULE,
  inspectInboundTransportAdapterGateInvariant,
} from "../../src/audit/rules/inbound-transport-adapter-gate.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const ADAPTER_FILE = "src/core/inbound-transport.ts";

test("AUDIT-432 protects the protocol-neutral transport adapter port", () => {
  assert.equal(INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE.id, "AUDIT-432");
  assert.equal(INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE.check().status, "pass");
});

test("AUDIT-433 protects decode-handler-response ordering", () => {
  assert.equal(INBOUND_TRANSPORT_ADAPTER_GATE_RULE.id, "AUDIT-433");
  assert.equal(INBOUND_TRANSPORT_ADAPTER_GATE_RULE.check().status, "pass");
});

test("AUDIT-432 and AUDIT-433 extend the inbound rules contiguously", () => {
  const indexes = ["AUDIT-431", "AUDIT-432", "AUDIT-433"].map((id) =>
    AUDIT_RULES.findIndex((rule) => rule.id === id),
  );

  assert.notEqual(indexes[0], -1);
  assert.equal(indexes[1], indexes[0] + 1);
  assert.equal(indexes[2], indexes[1] + 1);
  assert.equal(AUDIT_RULES[indexes[1]]?.metadata.introducedIn, "V14.0d");
  assert.equal(AUDIT_RULES[indexes[2]]?.metadata.introducedIn, "V14.0d");
  assert.deepEqual(AUDIT_RULES[indexes[1]]?.metadata.dependsOn, ["AUDIT-431"]);
  assert.deepEqual(AUDIT_RULES[indexes[2]]?.metadata.dependsOn, ["AUDIT-432"]);
});

test("AUDIT-432 detects concrete network transport regressions", () => {
  const source = readFileSync(ADAPTER_FILE, "utf8");
  const result = inspectInboundTransportAdapterNeutralityInvariant(
    `${source}\nfetch("https://example.invalid")\n`,
  );

  assert.deepEqual(result.forbidden, ["fetch("]);
});

test("AUDIT-433 detects handler bypasses", () => {
  const source = `${readFileSync(ADAPTER_FILE, "utf8")}\nverifyInboundAuthenticationAndPrepareLoopRuntimeRequest(unsafe)\n`;
  const result = inspectInboundTransportAdapterGateInvariant(source);

  assert.deepEqual(result.forbidden, [
    "verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(",
  ]);
});

test("AUDIT-433 detects duplicate V14.0c handler calls", () => {
  const source = readFileSync(ADAPTER_FILE, "utf8");
  const call = "await handleInboundLoopRuntimeRequest(decoded as never, dependencies)";
  const result = inspectInboundTransportAdapterGateInvariant(`${source}\n${call}\n`);

  assert.equal(result.handlerCallCount, 2);
});

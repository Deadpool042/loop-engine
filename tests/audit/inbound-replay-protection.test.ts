import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE,
  inspectInboundReplayProtectionNeutralityInvariant,
} from "../../src/audit/rules/inbound-replay-protection-neutrality.js";
import {
  INBOUND_REPLAY_PROTECTION_GATE_RULE,
  inspectInboundReplayProtectionGateInvariant,
} from "../../src/audit/rules/inbound-replay-protection-gate.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const FILE = "src/inbound-security/replay-protection.ts";

test("AUDIT-434 protects replay-port neutrality", () => {
  assert.equal(INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE.id, "AUDIT-434");
  assert.equal(INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE.check().status, "pass");
});

test("AUDIT-435 protects replay-port invocation boundary", () => {
  assert.equal(INBOUND_REPLAY_PROTECTION_GATE_RULE.id, "AUDIT-435");
  assert.equal(INBOUND_REPLAY_PROTECTION_GATE_RULE.check().status, "pass");
});

test("AUDIT-434 and AUDIT-435 extend inbound rules contiguously", () => {
  const indexes = ["AUDIT-433", "AUDIT-434", "AUDIT-435"].map((id) =>
    AUDIT_RULES.findIndex((rule) => rule.id === id),
  );

  assert.notEqual(indexes[0], -1);
  assert.equal(indexes[1], indexes[0] + 1);
  assert.equal(indexes[2], indexes[1] + 1);
  assert.deepEqual(AUDIT_RULES[indexes[1]]?.metadata.dependsOn, ["AUDIT-433"]);
  assert.deepEqual(AUDIT_RULES[indexes[2]]?.metadata.dependsOn, ["AUDIT-434"]);
});

test("AUDIT-434 detects concrete persistence regressions", () => {
  const source = readFileSync(FILE, "utf8");
  const result = inspectInboundReplayProtectionNeutralityInvariant(
    `${source}\nprocess.env.REDIS_URL\n`,
  );

  assert.deepEqual(result.forbidden, ["process.env"]);
});

test("AUDIT-435 detects lower-level boundary bypasses", () => {
  const source = `${readFileSync(FILE, "utf8")}\nevaluateInboundSecurity(unsafe)\n`;
  const result = inspectInboundReplayProtectionGateInvariant(source);

  assert.deepEqual(result.forbidden, ["evaluateInboundSecurity("]);
});

test("AUDIT-435 detects duplicate replay-port invocation", () => {
  const source = readFileSync(FILE, "utf8");
  const call = "await Reflect.apply(check, port, [input])";
  const result = inspectInboundReplayProtectionGateInvariant(`${source}\n${call}\n`);

  assert.equal(result.callCount, 2);
});

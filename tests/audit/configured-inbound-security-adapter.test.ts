import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CONFIGURED_INBOUND_SECURITY_ADAPTER_RULE,
  inspectConfiguredInboundSecurityAdapterInvariant,
} from "../../src/audit/rules/configured-inbound-security-adapter.js";

const CREDENTIAL_FILE = "src/inbound-security/configured-api-key.ts";
const ACL_FILE = "src/inbound-security/configured-acl.ts";
const REPLAY_FILE = "src/inbound-security/file-replay-protection.ts";
const ADAPTER_FILE = "src/inbound-adapters/configured-inbound-adapter.ts";
const CORE_EXPORT_FILE = "src/core/configured-inbound-security-adapter.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/configured-inbound-security-adapter.md";

describe("configured inbound security adapter audit", () => {
  it("registers AUDIT-496 and passes against the delivered vertical", () => {
    assert.equal(CONFIGURED_INBOUND_SECURITY_ADAPTER_RULE.id, "AUDIT-496");
    assert.equal(CONFIGURED_INBOUND_SECURITY_ADAPTER_RULE.check().status, "pass");
  });

  it("detects duplicate application-service calls and forbidden discovery", () => {
    const adapter = readFileSync(ADAPTER_FILE, "utf8");
    const result = inspectConfiguredInboundSecurityAdapterInvariant(
      readFileSync(CREDENTIAL_FILE, "utf8"),
      readFileSync(ACL_FILE, "utf8"),
      readFileSync(REPLAY_FILE, "utf8"),
      `${adapter}\nexecutePreparedInboundRuntimeRequest(envelope, dependencies);\nprocess.env.SECRET;`,
      readFileSync(CORE_EXPORT_FILE, "utf8"),
      readFileSync(ARCHITECTURE_FILE, "utf8"),
    );

    assert.equal(result.applicationServiceCallCount, 2);
    assert.deepEqual(result.forbidden, ["process.env"]);
  });
});

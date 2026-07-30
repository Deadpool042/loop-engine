import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  executeConfiguredInboundAdapterRequest,
  hashConfiguredApiKeySecret,
  type ConfiguredApiKeyCredentialRecord,
  type ConfiguredInboundAclRule,
  type ConfiguredInboundAdapterDependencies,
  type ConfiguredInboundAdapterRequest,
} from "../../src/core/index.js";

const NOW = "2026-07-30T04:30:00.000Z";

function request(): ConfiguredInboundAdapterRequest {
  return Object.freeze({
    requestId: "hostile-input-request",
    evaluatedAt: NOW,
    credentialId: "credential-1",
    credentialSecret: "secret",
    nonce: "nonce-1",
    project: "loop-engine",
    operation: "execute",
    payload: Object.freeze({
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      mode: "execute",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "medium",
      budget: Object.freeze({
        maxTokens: 1,
        maxCostUsd: 0,
        maxDurationMs: 1,
        maxCalls: 1,
        maxRepairs: 0,
      }),
    }),
  });
}

function credentialRecord(): ConfiguredApiKeyCredentialRecord {
  return Object.freeze({
    credentialId: "credential-1",
    secretSha256: hashConfiguredApiKeySecret("secret"),
    issuerId: "issuer-1",
    subjectId: "principal-1",
    principal: Object.freeze({
      principalId: "principal-1",
      principalType: "operator",
      tenantId: "tenant-1",
      roles: Object.freeze(["operator"]),
    }),
    issuedAt: "2026-07-30T03:00:00.000Z",
    validFrom: "2026-07-30T03:00:00.000Z",
    expiresAt: "2026-07-30T06:00:00.000Z",
  });
}

function aclRule(): ConfiguredInboundAclRule {
  return Object.freeze({
    ruleId: "rule-1",
    tenantId: "tenant-1",
    requiredRoles: Object.freeze(["operator"]),
    projects: Object.freeze(["loop-engine"]),
    operations: Object.freeze(["execute"]),
  });
}

describe("configured inbound adapter hostile inputs", () => {
  it("rejects a request whose property descriptors throw", async () => {
    const hostile = new Proxy(request(), {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap must not escape");
      },
    });

    const result = await executeConfiguredInboundAdapterRequest(
      hostile,
      null as unknown as ConfiguredInboundAdapterDependencies,
    );

    assert.deepEqual(result, {
      schemaVersion: 1,
      outcome: "rejected",
      requestId: null,
      stage: "adapter",
      reason: "malformed_request",
    });
  });

  it("rejects a credential record whose descriptors throw", async () => {
    const hostileRecord = new Proxy({} as ConfiguredApiKeyCredentialRecord, {
      getOwnPropertyDescriptor() {
        throw new Error("credential descriptor trap must not escape");
      },
    });
    const dependencies = {
      credentialRecords: Object.freeze([hostileRecord]),
      aclRules: Object.freeze([aclRule()]),
    } as unknown as ConfiguredInboundAdapterDependencies;

    const result = await executeConfiguredInboundAdapterRequest(
      request(),
      dependencies,
    );

    assert.deepEqual(result, {
      schemaVersion: 1,
      outcome: "rejected",
      requestId: "hostile-input-request",
      stage: "adapter",
      reason: "credential_configuration_invalid",
    });
  });

  it("rejects an ACL accessor without reading it", async () => {
    let ruleIdReads = 0;
    const hostileAcl = {
      get ruleId() {
        ruleIdReads += 1;
        return "rule-1";
      },
      tenantId: "tenant-1",
      requiredRoles: Object.freeze(["operator"]),
      projects: Object.freeze(["loop-engine"]),
      operations: Object.freeze(["execute"]),
    } as ConfiguredInboundAclRule;
    const dependencies = {
      credentialRecords: Object.freeze([credentialRecord()]),
      aclRules: Object.freeze([hostileAcl]),
    } as unknown as ConfiguredInboundAdapterDependencies;

    const result = await executeConfiguredInboundAdapterRequest(
      request(),
      dependencies,
    );

    assert.deepEqual(result, {
      schemaVersion: 1,
      outcome: "rejected",
      requestId: "hostile-input-request",
      stage: "adapter",
      reason: "acl_configuration_invalid",
    });
    assert.equal(ruleIdReads, 0);
  });
});

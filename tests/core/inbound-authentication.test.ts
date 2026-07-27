import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  verifyInboundAuthenticationAndPrepareLoopRuntimeRequest,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";
import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationEvidence,
  InboundAuthenticationInput,
  InboundAuthenticationVerifier,
  InboundPrincipal,
  InboundReplayEvidence,
} from "../../src/inbound-security/index.js";

const EVALUATED_AT = "2026-07-26T12:00:00.000Z";
const AUTH_INPUT: InboundAuthenticationInput = Object.freeze({
  method: "opaque",
  credential: "raw-secret-never-forward",
  issuerHint: "issuer-1",
  subjectHint: "principal-1",
});

function payload(mode: "execute" | "dry-run" = "execute") {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    cycleId: "cycle-1",
    mode,
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "medium",
    budget: {
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };
}

function assembly(): LoopRuntimeAuthorizedEngineAssembly {
  return {
    catalog: {
      policies: [
        {
          ref: "policy.ref",
          value: { policyRef: "policy.ref", policyId: "policy-id" },
        },
      ],
      profiles: [
        {
          ref: "profile.ref",
          value: {
            profileRef: "profile.ref",
            profileId: "profile-id",
            maxEffort: "medium",
          },
        },
      ],
    },
    limits: {
      maxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      },
    },
    binding: {
      runtimeId: "local-process",
      executable: "node",
      arguments: ["--version"],
    },
  };
}

function evidence(): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-26T11:00:00.000Z",
    validFrom: "2026-07-26T11:00:00.000Z",
    expiresAt: "2026-07-26T13:00:00.000Z",
  });
}

function principal(): InboundPrincipal {
  return Object.freeze({
    principalId: "principal-1",
    principalType: "user",
    tenantId: "tenant-1",
    roles: Object.freeze(["operator"]),
  });
}

function accessRequest(
  overrides: Partial<InboundAccessRequest> = {},
): InboundAccessRequest {
  return Object.freeze({
    requestId: "request-1",
    principalId: "principal-1",
    tenantId: "tenant-1",
    project: "loop-engine",
    operation: "execute",
    ...overrides,
  });
}

function replayEvidence(): InboundReplayEvidence {
  return Object.freeze({
    requestId: "request-1",
    evidenceId: "evidence-1",
    receivedAt: EVALUATED_AT,
    nonce: "nonce-1",
    replayed: false,
  });
}

function policy(
  overrides: Partial<InboundAccessPolicy> = {},
): InboundAccessPolicy {
  return Object.freeze({
    allowedOperations: Object.freeze(["execute", "dry-run"]),
    replayCheckRequired: true,
    ...overrides,
  });
}

function counters() {
  return { authorizer: 0, assembler: 0, verifier: 0 };
}

function authorizer(calls: ReturnType<typeof counters>): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize() {
      calls.authorizer += 1;
      return { authorized: true };
    },
  };
}

function assemblerStub(calls: ReturnType<typeof counters>) {
  return {
    assemble() {
      calls.assembler += 1;
      return { assembled: true as const, assembly: assembly() };
    },
  };
}

function verifier(
  calls: ReturnType<typeof counters>,
  result: unknown = { verified: true, evidence: evidence() },
): InboundAuthenticationVerifier {
  return {
    verify() {
      calls.verifier += 1;
      return result as never;
    },
  };
}

function input(
  calls: ReturnType<typeof counters>,
  authVerifier: InboundAuthenticationVerifier | null = verifier(calls),
) {
  return {
    authenticationInput: AUTH_INPUT,
    verificationContext: Object.freeze({
      requestId: "request-1",
      evaluatedAt: EVALUATED_AT,
    }),
    verifier: authVerifier,
    replayProtectionPort: {
      check() {
        return { accepted: true, receivedAt: EVALUATED_AT };
      },
    },
    security: Object.freeze({
      principal: principal(),
      accessRequest: accessRequest(),
      replayEvidence: replayEvidence(),
      policy: policy(),
    }),
    evaluatedAt: EVALUATED_AT,
    payload: payload(),
    authorizer: authorizer(calls),
    assembler: assemblerStub(calls),
  };
}

describe("verifyInboundAuthenticationAndPrepareLoopRuntimeRequest", () => {
  it("fails closed before V14.0a and downstream preparation when verification fails", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(
        calls,
        verifier(calls, { verified: false, reason: "rejected" }),
      ),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_rejected",
    });
    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(JSON.stringify(result).includes("raw-secret-never-forward"), false);
  });

  it("verifies exactly once then reuses V14.0a for an allowed request", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(calls),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
      if (result.security.allowed) {
        assert.equal(result.security.decision.kind, "allow");
        assert.equal(result.security.prepared.prepared, true);
      }
    }
    assert.equal(JSON.stringify(result).includes("raw-secret-never-forward"), false);
  });

  it("preserves a downstream security deny without invoking authorization or assembly", async () => {
    const calls = counters();
    const base = input(calls);
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      security: Object.freeze({
        ...base.security,
        policy: policy({ allowedOperations: ["dry-run"] }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
    }
  });

  it("keeps downstream preparation failure redacted after successful verification", async () => {
    const calls = counters();
    const base = input(calls);
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      payload: payload("dry-run"),
    });

    assert.equal(result.verified, true);
    assert.equal(calls.verifier, 1);
    if (result.verified && result.security.allowed) {
      assert.equal(result.security.prepared.prepared, false);
    }
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "raw-secret-never-forward",
      "credentialFingerprint",
      "evidenceId",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("invokes replay protection exactly once after successful authentication", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 1);
    assert.equal(result.verified, true);
  });

  it("rejects not-yet-valid authentication evidence before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      evaluatedAt: "2025-12-31T23:59:59Z",
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(
        result.security.decision.reason,
        "authentication_not_yet_valid",
      );
    }
  });

  it("rejects expired authentication evidence before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      evaluatedAt: "2027-01-01T00:00:01Z",
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(
        result.security.decision.reason,
        "authentication_expired",
      );
    }
  });

  it("returns insufficient evidence for missing principal before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        principal: null,
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "indeterminate");
      assert.equal(
        result.security.decision.reason,
        "insufficient_evidence",
      );
    }
  });

  it("rejects tenant mismatch before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        principal: Object.freeze({
          ...base.security.principal!,
          tenantId: "different-tenant",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "tenant_mismatch");
    }
  });

  it("rejects principal mismatch before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        principal: Object.freeze({
          ...base.security.principal!,
          principalId: "different-principal",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "principal_mismatch");
    }
  });

  it("rejects an undecodable payload before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      payload: null,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "operation_mismatch");
    }
  });

  it("rejects project mismatch before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      payload: Object.freeze({
        ...base.payload,
        project: "different-project",
      }),
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "project_mismatch");
    }
  });

  it("rejects operation mismatch before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      payload: Object.freeze({
        ...base.payload,
        mode: "dry-run",
      }),
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "operation_mismatch");
    }
  });

  it("rejects an operation disallowed by policy before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        policy: policy({
          allowedOperations: Object.freeze(["dry-run"]),
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "operation_not_allowed");
    }
  });

  it("rejects mismatched replay evidence before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        replayEvidence: Object.freeze({
          ...base.security.replayEvidence!,
          evidenceId: "different-evidence-id",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects replay evidence bound to a different requestId before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        replayEvidence: Object.freeze({
          ...base.security.replayEvidence!,
          requestId: "different-request-id",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects replay evidence already marked as replayed before invoking replay protection", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
      security: Object.freeze({
        ...base.security,
        replayEvidence: Object.freeze({
          ...base.security.replayEvidence!,
          replayed: true,
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("blocks downstream preparation when replay protection rejects", async () => {
    const calls = counters();
    const base = input(calls);

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          return { accepted: false, reason: "replay_detected" };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("does not invoke replay protection when authentication fails", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, { verified: false, reason: "rejected" }),
    );
    let replayCalls = 0;

    await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

});

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

  it("rejects an evaluation-time mismatch between verification context and Core", async () => {
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
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "2026-07-26T13:00:00.000Z",
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
      assert.equal(result.security.decision.reason, "evaluation_time_mismatch");
    }
  });

  it("accepts a valid ISO evaluatedAt", async () => {
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

    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects an unparseable evaluatedAt before any temporal comparison", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      evaluatedAt: "not-a-date",
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "not-a-date",
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
      assert.equal(result.security.decision.reason, "evaluation_time_mismatch");
    }
  });

  it("rejects an evaluatedAt with an impossible calendar date", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      evaluatedAt: "2026-13-45T00:00:00.000Z",
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "2026-13-45T00:00:00.000Z",
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
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "evaluation_time_mismatch");
    }
  });

  it("rejects an empty string evaluatedAt before any temporal comparison", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      evaluatedAt: "",
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "",
      }),
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    // An empty verificationContext.evaluatedAt is already rejected by the
    // existing verification-context shape check (isNonEmptyString) before
    // `isInvalidEvaluationTime` is ever reached — this asserts that earlier
    // guarantee still holds rather than re-deriving it.
    assert.equal(calls.verifier, 0);
    assert.equal(replayCalls, 0);
    assert.equal(result.verified, false);

    if (!result.verified) {
      assert.equal(result.reason, "verification_invalid");
    }
  });

  it("accepts a valid accessRequest.requestId", async () => {
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

    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("accepts a single-character accessRequest.requestId as a valid boundary value", async () => {
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
      verificationContext: Object.freeze({
        requestId: "x",
        evaluatedAt: EVALUATED_AT,
      }),
      security: Object.freeze({
        ...base.security,
        accessRequest: accessRequest({ requestId: "x" }),
        replayEvidence: Object.freeze({
          ...base.security.replayEvidence!,
          requestId: "x",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 1);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects an empty string accessRequest.requestId before any identity comparison", async () => {
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
        accessRequest: accessRequest({ requestId: "" }),
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
      assert.equal(result.security.decision.reason, "request_id_mismatch");
    }
  });

  it("rejects a whitespace-only accessRequest.requestId before any identity comparison", async () => {
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
        accessRequest: accessRequest({ requestId: "   " }),
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
      assert.equal(result.security.decision.reason, "request_id_mismatch");
    }
  });

  it("rejects a request identity mismatch before invoking replay protection", async () => {
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
      verificationContext: Object.freeze({
        requestId: "request-mismatch",
        evaluatedAt: EVALUATED_AT,
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
      assert.equal(result.security.decision.reason, "request_id_mismatch");
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
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "2025-12-31T23:59:59Z",
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
      verificationContext: Object.freeze({
        requestId: "request-1",
        evaluatedAt: "2027-01-01T00:00:01Z",
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

  it("accepts replay evidence with a valid ISO receivedAt", async () => {
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

    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects replay evidence with an unparseable receivedAt before invoking replay protection", async () => {
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
          receivedAt: "not-a-date",
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

  it("rejects replay evidence with an impossible calendar date receivedAt", async () => {
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
          receivedAt: "2026-13-45T00:00:00.000Z",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects replay evidence with an empty string receivedAt before invoking replay protection", async () => {
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
          receivedAt: "",
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects replay evidence received after the evaluation instant before invoking replay protection", async () => {
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
          receivedAt: "2026-07-26T13:00:00.000Z",
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

  it("rejects a blank replay nonce before invoking replay protection", async () => {
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
          nonce: "   ",
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

  it("accepts a null replay nonce", async () => {
    const calls = counters();
    const base = input(calls);

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      security: Object.freeze({
        ...base.security,
        replayEvidence: Object.freeze({
          ...base.security.replayEvidence!,
          nonce: null,
        }),
      }),
    });

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects a replay port result received after the evaluation instant", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: "2026-07-30T00:00:00.000Z" };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects a replay port result with an unparseable receivedAt before comparing it to the evaluation instant", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: "not-a-date" };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("rejects a replay port result with an impossible calendar date receivedAt", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: "2026-13-45T00:00:00.000Z" };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.verified, true);

    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "deny");
      assert.equal(result.security.decision.reason, "replay_rejected");
    }
  });

  it("accepts a replay port result with a valid boundary receivedAt equal to the evaluation instant", async () => {
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

    if (result.verified) {
      assert.equal(result.security.allowed, true);
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

  it("accepts a verified evidence whose method matches the declared authentication input", async () => {
    const calls = counters();
    const base = input(calls);

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(base);

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("accepts a single-character method that matches exactly", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, {
        verified: true,
        evidence: { ...evidence(), method: "x" },
      }),
    );

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, method: "x" },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects a verified evidence whose method differs from the declared authentication input, without invoking replay protection or Runtime preparation", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, {
        verified: true,
        evidence: { ...evidence(), method: "other-method" },
      }),
    );
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
    assert.equal(replayCalls, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a case-different method match without any normalization", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, {
        verified: true,
        evidence: { ...evidence(), method: "Opaque" },
      }),
    );
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
    assert.equal(replayCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("returns a deterministic and stable result for a method mismatch across repeated calls", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, {
        verified: true,
        evidence: { ...evidence(), method: "other-method" },
      }),
    );

    const first = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(base);
    const second = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(base);

    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("accepts a null subjectHint without comparing it to the evidence subjectId", async () => {
    const calls = counters();
    const base = input(calls);

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, subjectHint: null },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("accepts a subjectHint identical to the evidence subjectId", async () => {
    const calls = counters();
    const base = input(calls);

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, subjectHint: "principal-1" },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("accepts a single-character subjectHint that matches exactly", async () => {
    const calls = counters();
    const base = input(
      calls,
      verifier(calls, {
        verified: true,
        evidence: { ...evidence(), subjectId: "p" },
      }),
    );

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, subjectHint: "p" },
      security: {
        ...base.security,
        principal: { ...principal(), principalId: "p" },
        accessRequest: accessRequest({ principalId: "p" }),
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, true);
    }
  });

  it("rejects a subjectHint that differs from the evidence subjectId, without invoking replay protection or Runtime preparation", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, subjectHint: "other-principal" },
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
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a case-different subjectHint match without any normalization", async () => {
    const calls = counters();
    const base = input(calls);
    let replayCalls = 0;

    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
      ...base,
      authenticationInput: { ...AUTH_INPUT, subjectHint: "Principal-1" },
      replayProtectionPort: {
        check() {
          replayCalls += 1;
          return { accepted: true, receivedAt: EVALUATED_AT };
        },
      },
    });

    assert.equal(calls.verifier, 1);
    assert.equal(replayCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("returns a deterministic and stable result for a subjectHint mismatch across repeated calls", async () => {
    const calls = counters();
    const base = {
      ...input(calls),
      authenticationInput: { ...AUTH_INPUT, subjectHint: "other-principal" },
    };

    const first = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(base);
    const second = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(base);

    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      verified: false,
      reason: "verification_invalid",
    });
  });

});

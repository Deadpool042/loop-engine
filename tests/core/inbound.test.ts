import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  handleInboundLoopRuntimeRequest,
  validateInboundLoopRuntimeRequestEnvelope,
  type InboundLoopRuntimeRequestEnvelope,
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

const EVALUATED_AT = "2026-07-27T12:00:00.000Z";
const REQUEST_ID = "request-1";

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
    issuedAt: "2026-07-27T11:00:00.000Z",
    validFrom: "2026-07-27T11:00:00.000Z",
    expiresAt: "2026-07-27T13:00:00.000Z",
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
    requestId: REQUEST_ID,
    principalId: "principal-1",
    tenantId: "tenant-1",
    project: "loop-engine",
    operation: "execute",
    ...overrides,
  });
}

function replayEvidence(
  overrides: Partial<InboundReplayEvidence> = {},
): InboundReplayEvidence {
  return Object.freeze({
    requestId: REQUEST_ID,
    evidenceId: "evidence-1",
    receivedAt: EVALUATED_AT,
    nonce: "nonce-1",
    replayed: false,
    ...overrides,
  });
}

function policy(overrides: Partial<InboundAccessPolicy> = {}): InboundAccessPolicy {
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
  { async: isAsync = false }: { async?: boolean } = {},
): InboundAuthenticationVerifier {
  return {
    verify() {
      calls.verifier += 1;
      return isAsync ? Promise.resolve(result as never) : (result as never);
    },
  };
}

function envelope(
  overrides: Partial<InboundLoopRuntimeRequestEnvelope> = {},
): InboundLoopRuntimeRequestEnvelope {
  return Object.freeze({
    requestId: REQUEST_ID,
    authenticationInput: AUTH_INPUT,
    verificationContext: Object.freeze({
      requestId: REQUEST_ID,
      evaluatedAt: EVALUATED_AT,
    }),
    principal: principal(),
    accessRequest: accessRequest(),
    replayEvidence: replayEvidence(),
    policy: policy(),
    evaluatedAt: EVALUATED_AT,
    payload: payload(),
    ...overrides,
  });
}

function dependencies(
  calls: ReturnType<typeof counters>,
  authVerifier: InboundAuthenticationVerifier | null = verifier(calls),
) {
  return {
    verifier: authVerifier,
    authorizer: authorizer(calls),
    assembler: assemblerStub(calls),
  };
}

describe("validateInboundLoopRuntimeRequestEnvelope", () => {
  it("rejects a malformed envelope", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope({ requestId: "x" });
    assert.deepEqual(result, { valid: false, reason: "malformed_envelope" });
  });

  it("rejects a non-object envelope", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope("not-an-envelope");
    assert.deepEqual(result, { valid: false, reason: "malformed_envelope" });
  });

  it("rejects a request id mismatch against the access request", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope(
      envelope({ accessRequest: accessRequest({ requestId: "other" }) }),
    );
    assert.deepEqual(result, { valid: false, reason: "request_id_mismatch" });
  });

  it("rejects a request id mismatch against the replay evidence", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope(
      envelope({ replayEvidence: replayEvidence({ requestId: "other" }) }),
    );
    assert.deepEqual(result, { valid: false, reason: "request_id_mismatch" });
  });

  it("accepts a structurally valid, identity-consistent envelope", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope(envelope());
    assert.deepEqual(result, { valid: true });
  });

  it("accepts null replay evidence and null principal", () => {
    const result = validateInboundLoopRuntimeRequestEnvelope(
      envelope({ replayEvidence: null, principal: null }),
    );
    assert.deepEqual(result, { valid: true });
  });
});

describe("handleInboundLoopRuntimeRequest", () => {
  it("rejects a malformed envelope before any dependency call", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      { requestId: "x" } as unknown as InboundLoopRuntimeRequestEnvelope,
      dependencies(calls),
    );

    assert.deepEqual(result, { outcome: "invalid", reason: "malformed_envelope" });
    assert.equal(calls.verifier, 0);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("rejects a request id mismatch before any dependency call", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ accessRequest: accessRequest({ requestId: "other" }) }),
      dependencies(calls),
    );

    assert.deepEqual(result, { outcome: "invalid", reason: "request_id_mismatch" });
    assert.equal(calls.verifier, 0);
  });

  it("rejects a replay request id mismatch before any dependency call", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ replayEvidence: replayEvidence({ requestId: "other" }) }),
      dependencies(calls),
    );

    assert.deepEqual(result, { outcome: "invalid", reason: "request_id_mismatch" });
    assert.equal(calls.verifier, 0);
  });

  it("fails closed on malformed authentication input", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ authenticationInput: {} as unknown as InboundAuthenticationInput }),
      dependencies(calls),
    );

    assert.deepEqual(result, {
      outcome: "rejected",
      stage: "authentication",
      reason: "verification_invalid",
    });
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("treats a missing verifier as an authentication failure", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope(),
      dependencies(calls, null),
    );

    assert.deepEqual(result, {
      outcome: "rejected",
      stage: "authentication",
      reason: "verification_unavailable",
    });
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("propagates verifier rejection without touching downstream authorization", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope(),
      dependencies(calls, verifier(calls, { verified: false, reason: "rejected" })),
    );

    assert.deepEqual(result, {
      outcome: "rejected",
      stage: "authentication",
      reason: "verification_rejected",
    });
    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("treats a verifier exception as verification unavailable/invalid without crashing", async () => {
    const calls = counters();
    const throwingVerifier: InboundAuthenticationVerifier = {
      verify() {
        calls.verifier += 1;
        throw new Error("boom");
      },
    };
    const result = await handleInboundLoopRuntimeRequest(
      envelope(),
      dependencies(calls, throwingVerifier),
    );

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected" && result.stage === "authentication") {
      assert.equal(result.reason, "verification_invalid");
    }
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("denies on inbound security deny without invoking authorizer or assembler", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ policy: policy({ allowedOperations: ["dry-run"] }) }),
      dependencies(calls),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected" && result.stage === "security") {
      assert.equal(result.decision.kind, "deny");
    }
  });

  it("treats a missing principal as inbound security indeterminate", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ principal: null }),
      dependencies(calls),
    );

    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected" && result.stage === "security") {
      assert.equal(result.decision.kind, "indeterminate");
    }
  });

  it("accepts and reaches downstream preparation exactly once for a dry-run operation authorized by policy", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ accessRequest: accessRequest({ operation: "dry-run" }) }),
      dependencies(calls),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(result.outcome, "accepted");
  });

  it("accepts the request exactly once for an allowed execute path", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(envelope(), dependencies(calls));

    assert.equal(calls.verifier, 1);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(result.outcome, "accepted");
    if (result.outcome === "accepted") {
      assert.equal(result.prepared.prepared, true);
    }
  });

  it("keeps a downstream preparation failure inside an accepted outcome, redacted", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope({ payload: { not: "a valid public request" } }),
      dependencies(calls),
    );

    assert.equal(result.outcome, "accepted");
    if (result.outcome === "accepted") {
      assert.equal(result.prepared.prepared, false);
    }
  });

  it("does not retry the verifier on repeated calls with the same input", async () => {
    const calls = counters();
    const deps = dependencies(calls);
    await handleInboundLoopRuntimeRequest(envelope(), deps);
    await handleInboundLoopRuntimeRequest(envelope(), deps);

    assert.equal(calls.verifier, 2);
  });

  it("supports a synchronous verifier", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope(),
      dependencies(calls, verifier(calls, undefined, { async: false })),
    );

    assert.equal(result.outcome, "accepted");
  });

  it("supports an asynchronous verifier", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(
      envelope(),
      dependencies(calls, verifier(calls, undefined, { async: true })),
    );

    assert.equal(result.outcome, "accepted");
  });

  it("produces deterministic results for equivalent inputs", async () => {
    const callsA = counters();
    const callsB = counters();
    const resultA = await handleInboundLoopRuntimeRequest(envelope(), dependencies(callsA));
    const resultB = await handleInboundLoopRuntimeRequest(envelope(), dependencies(callsB));

    assert.deepEqual(resultA, resultB);
  });

  it("returns an immutable (frozen) result", async () => {
    const calls = counters();
    const result = await handleInboundLoopRuntimeRequest(envelope(), dependencies(calls));
    assert.equal(Object.isFrozen(result), true);
  });

  it("never exposes raw credential material or verifier exception text in any outcome", async () => {
    const calls = counters();
    const throwingVerifier: InboundAuthenticationVerifier = {
      verify() {
        throw new Error("super-secret-stack-trace-detail");
      },
    };

    const outcomes = await Promise.all([
      handleInboundLoopRuntimeRequest(
        { requestId: "x" } as unknown as InboundLoopRuntimeRequestEnvelope,
        dependencies(calls),
      ),
      handleInboundLoopRuntimeRequest(envelope(), dependencies(calls, throwingVerifier)),
      handleInboundLoopRuntimeRequest(
        envelope({ policy: policy({ allowedOperations: ["dry-run"] }) }),
        dependencies(calls),
      ),
      handleInboundLoopRuntimeRequest(envelope(), dependencies(calls)),
    ]);

    const serialized = JSON.stringify(outcomes);
    for (const forbidden of [
      "raw-secret-never-forward",
      "super-secret-stack-trace-detail",
      "credentialFingerprint",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("does not accept transport-specific properties as part of the envelope", () => {
    const withHttp = {
      ...envelope(),
      httpMethod: "POST",
    } as unknown;
    const result = validateInboundLoopRuntimeRequestEnvelope(withHttp);
    assert.deepEqual(result, { valid: false, reason: "malformed_envelope" });
  });
});

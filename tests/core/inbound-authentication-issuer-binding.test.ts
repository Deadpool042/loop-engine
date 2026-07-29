import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  verifyInboundAuthenticationAndPrepareLoopRuntimeRequest,
  type LoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";
import type {
  InboundAuthenticationEvidence,
  InboundAuthenticationInput,
  InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const EVALUATED_AT = "2026-07-26T12:00:00.000Z";

function evidence(
  overrides: Partial<InboundAuthenticationEvidence> = {},
): InboundAuthenticationEvidence {
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
    ...overrides,
  });
}

function counters() {
  return { verifier: 0, replay: 0, authorizer: 0, assembler: 0 };
}

function verifier(
  calls: ReturnType<typeof counters>,
  verifiedEvidence: InboundAuthenticationEvidence = evidence(),
): InboundAuthenticationVerifier {
  return {
    verify() {
      calls.verifier += 1;
      return { verified: true as const, evidence: verifiedEvidence };
    },
  };
}

function input(
  calls: ReturnType<typeof counters>,
  authenticationInput: InboundAuthenticationInput,
  verifiedEvidence: InboundAuthenticationEvidence = evidence(),
) {
  const authorizer: LoopRuntimePublicRequestAuthorizer = {
    authorize() {
      calls.authorizer += 1;
      throw new Error("authorizer must not be invoked by issuer binding tests");
    },
  };
  const assembler: LoopRuntimeAuthorizedEngineAssembler = {
    assemble() {
      calls.assembler += 1;
      throw new Error("assembler must not be invoked by issuer binding tests");
    },
  };

  return {
    authenticationInput,
    verificationContext: Object.freeze({
      requestId: "request-1",
      evaluatedAt: EVALUATED_AT,
    }),
    verifier: verifier(calls, verifiedEvidence),
    replayProtectionPort: {
      check() {
        calls.replay += 1;
        throw new Error("replay protection must not be invoked by issuer binding tests");
      },
    },
    security: Object.freeze({
      principal: null,
      accessRequest: Object.freeze({
        requestId: "request-1",
        principalId: "principal-1",
        tenantId: null,
        project: "loop-engine",
        operation: "execute" as const,
      }),
      replayEvidence: null,
      policy: Object.freeze({
        allowedOperations: Object.freeze(["execute" as const]),
        replayCheckRequired: false,
      }),
    }),
    evaluatedAt: EVALUATED_AT,
    payload: null,
    authorizer,
    assembler,
  };
}

function authenticationInput(
  overrides: Partial<InboundAuthenticationInput> = {},
): InboundAuthenticationInput {
  return Object.freeze({
    method: "opaque",
    credential: "raw-secret-never-forward",
    issuerHint: "issuer-1",
    subjectHint: null,
    ...overrides,
  });
}

describe("inbound authentication issuer hint binding", () => {
  it("accepts a null issuerHint without comparing it to evidence.issuerId", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(calls, authenticationInput({ issuerHint: null })),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "indeterminate");
    }
  });

  it("accepts an issuerHint identical to evidence.issuerId", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(calls, authenticationInput()),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.security.allowed, false);
      assert.equal(result.security.decision.kind, "indeterminate");
    }
  });

  it("accepts a single-character issuerHint that matches exactly", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(
        calls,
        authenticationInput({ issuerHint: "i" }),
        evidence({ issuerId: "i" }),
      ),
    );

    assert.equal(calls.verifier, 1);
    assert.equal(result.verified, true);
  });

  it("rejects an issuerHint mismatch before replay protection or Runtime preparation", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(calls, authenticationInput({ issuerHint: "other-issuer" })),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.deepEqual(calls, {
      verifier: 1,
      replay: 0,
      authorizer: 0,
      assembler: 0,
    });
  });

  it("rejects a case-different issuerHint without normalization", async () => {
    const calls = counters();
    const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
      input(calls, authenticationInput({ issuerHint: "Issuer-1" })),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls.replay, 0);
  });

  it("returns a deterministic stable result for repeated issuerHint mismatches", async () => {
    const calls = counters();
    const value = input(
      calls,
      authenticationInput({ issuerHint: "other-issuer" }),
    );

    const first = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(value);
    const second = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(value);

    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      verified: false,
      reason: "verification_invalid",
    });
  });
});

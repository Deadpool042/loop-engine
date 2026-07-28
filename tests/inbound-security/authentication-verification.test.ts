import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationInput,
  type InboundAuthenticationVerificationContext,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const INPUT: InboundAuthenticationInput = Object.freeze({
  method: "opaque",
  credential: "super-secret-material",
  issuerHint: "issuer-1",
  subjectHint: "principal-1",
});

const CONTEXT: InboundAuthenticationVerificationContext = Object.freeze({
  requestId: "request-1",
  evaluatedAt: "2026-07-26T12:00:00.000Z",
});

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

async function evaluate(verifier: unknown) {
  return evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    verifier as InboundAuthenticationVerifier,
  );
}

describe("evaluateInboundAuthenticationVerifier", () => {
  it("fails closed when the verifier is missing or malformed", async () => {
    assert.deepEqual(await evaluate(null), {
      verified: false,
      reason: "verification_unavailable",
    });
    assert.deepEqual(await evaluate({}), {
      verified: false,
      reason: "verification_unavailable",
    });
    assert.deepEqual(await evaluate({ verify: "not-callable" }), {
      verified: false,
      reason: "verification_unavailable",
    });

    const getterVerifier = Object.defineProperty({}, "verify", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    assert.deepEqual(await evaluate(getterVerifier), {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("redacts synchronous exceptions and promise rejections", async () => {
    const sync = await evaluate({
      verify() {
        throw new Error("super-secret-material should never escape");
      },
    });
    const asyncFailure = await evaluate({
      async verify() {
        throw new Error("another-secret");
      },
    });

    assert.deepEqual(sync, { verified: false, reason: "verification_invalid" });
    assert.deepEqual(asyncFailure, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(JSON.stringify(sync).includes("super-secret-material"), false);
    assert.equal(JSON.stringify(asyncFailure).includes("another-secret"), false);
  });

  it("canonicalizes explicit verifier failures", async () => {
    assert.deepEqual(
      await evaluate({ verify: () => ({ verified: false, reason: "rejected" }) }),
      { verified: false, reason: "verification_rejected" },
    );
    assert.deepEqual(
      await evaluate({ verify: () => ({ verified: false, reason: "unavailable" }) }),
      { verified: false, reason: "verification_unavailable" },
    );
    assert.deepEqual(
      await evaluate({ verify: () => ({ verified: false, reason: "invalid" }) }),
      { verified: false, reason: "verification_invalid" },
    );
  });

  it("rejects malformed results and invalid evidence", async () => {
    for (const verifier of [
      { verify: () => null },
      { verify: () => ({ verified: true }) },
      { verify: () => ({ verified: false, reason: "unknown" }) },
      {
        verify: () => ({
          verified: true,
          evidence: evidence({ verified: false }),
        }),
      },
      {
        verify: () => ({
          verified: true,
          evidence: { ...evidence(), extra: true },
        }),
      },
    ]) {
      assert.deepEqual(await evaluate(verifier), {
        verified: false,
        reason: "verification_invalid",
      });
    }
  });

  it("supports sync and async verifier success while preserving evidence identity", async () => {
    const first = evidence();
    const second = evidence({ evidenceId: "evidence-2" });

    const sync = await evaluate({
      verify() {
        return { verified: true, evidence: first };
      },
    });
    const asyncResult = await evaluate({
      async verify() {
        return { verified: true, evidence: second };
      },
    });

    assert.equal(sync.verified, true);
    assert.equal(asyncResult.verified, true);
    if (sync.verified && asyncResult.verified) {
      assert.equal(sync.evidence, first);
      assert.equal(asyncResult.evidence, second);
    }
    assert.equal(Object.isFrozen(sync), true);
    assert.equal(Object.isFrozen(asyncResult), true);
  });

  it("calls the verifier exactly once and preserves this", async () => {
    const trustedEvidence = evidence();
    let calls = 0;
    let preservedThis = false;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        preservedThis = this === verifier;
        return { verified: true, evidence: trustedEvidence };
      },
    };

    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      verifier,
    );

    assert.equal(result.verified, true);
    assert.equal(calls, 1);
    assert.equal(preservedThis, true);
  });

  it("rejects authentication evidence with an inverted validity window", async () => {
    let calls = 0;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        return {
          verified: true,
          evidence: evidence({
            validFrom: "2026-07-26T14:00:00.000Z",
            expiresAt: "2026-07-26T13:00:00.000Z",
          }),
        };
      },
    };

    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      verifier,
    );

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("accepts authentication evidence with an equal validFrom and expiresAt bound", async () => {
    const result = await evaluate({
      verify() {
        return {
          verified: true,
          evidence: evidence({
            validFrom: "2026-07-26T12:00:00.000Z",
            expiresAt: "2026-07-26T12:00:00.000Z",
          }),
        };
      },
    });

    assert.equal(result.verified, true);
  });

  it("never serializes raw authentication material in normalized results", async () => {
    const rejected = await evaluate({
      verify() {
        return { verified: false, reason: "rejected" };
      },
    });
    const successful = await evaluate({
      verify() {
        return { verified: true, evidence: evidence() };
      },
    });

    assert.equal(JSON.stringify(rejected).includes("super-secret-material"), false);
    assert.equal(JSON.stringify(successful).includes("super-secret-material"), false);
  });

  it("fails before verifier invocation for malformed input or context", async () => {
    let calls = 0;
    const verifier = {
      verify() {
        calls += 1;
        return { verified: true as const, evidence: evidence() };
      },
    };

    const invalidInput = await evaluateInboundAuthenticationVerifier(
      { ...INPUT, method: "" },
      CONTEXT,
      verifier,
    );
    const invalidContext = await evaluateInboundAuthenticationVerifier(
      INPUT,
      { ...CONTEXT, requestId: "" },
      verifier,
    );

    assert.deepEqual(invalidInput, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.deepEqual(invalidContext, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 0);
  });
});

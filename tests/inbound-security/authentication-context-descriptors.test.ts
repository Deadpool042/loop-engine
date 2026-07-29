import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationVerificationContext,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const INPUT = Object.freeze({
  method: "opaque",
  credential: "secret",
  issuerHint: "issuer-1",
  subjectHint: "subject-1",
});

const EVIDENCE: InboundAuthenticationEvidence = Object.freeze({
  evidenceId: "evidence-1",
  method: "opaque",
  subjectId: "subject-1",
  issuerId: "issuer-1",
  credentialFingerprint: "fingerprint-1",
  verified: true,
  issuedAt: "2026-07-29T11:00:00.000Z",
  validFrom: "2026-07-29T11:00:00.000Z",
  expiresAt: "2026-07-29T13:00:00.000Z",
});

async function evaluateContext(value: unknown) {
  let calls = 0;
  let received: InboundAuthenticationVerificationContext | null = null;
  const verifier: InboundAuthenticationVerifier = {
    verify(_input, context) {
      calls += 1;
      received = context;
      return { verified: true, evidence: EVIDENCE };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(
    INPUT,
    value as InboundAuthenticationVerificationContext,
    verifier,
  );
  return { calls, received, result };
}

describe("authentication context descriptors", () => {
  it("rejects an accessor-backed requestId without invoking it", async () => {
    let getterCalls = 0;
    const context = Object.defineProperty(
      { evaluatedAt: "2026-07-29T12:00:00.000Z" },
      "requestId",
      {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "request-1";
        },
      },
    );

    const { calls, result } = await evaluateContext(context);

    assert.equal(calls, 0);
    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a non-enumerable evaluatedAt before verifier invocation", async () => {
    const context = { requestId: "request-1" } as Record<string, unknown>;
    Object.defineProperty(context, "evaluatedAt", {
      enumerable: false,
      value: "2026-07-29T12:00:00.000Z",
    });

    const { calls, result } = await evaluateContext(context);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a symbol-keyed context extension before verifier invocation", async () => {
    const context = {
      requestId: "request-1",
      evaluatedAt: "2026-07-29T12:00:00.000Z",
      [Symbol("extra")]: true,
    };

    const { calls, result } = await evaluateContext(context);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("forwards an ordinary valid context unchanged exactly once", async () => {
    const context = Object.freeze({
      requestId: "request-1",
      evaluatedAt: "2026-07-29T12:00:00.000Z",
    });

    const { calls, received, result } = await evaluateContext(context);

    assert.equal(calls, 1);
    assert.equal(received, context);
    assert.equal(result.verified, true);
  });
});

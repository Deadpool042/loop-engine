import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationInput,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const CONTEXT = Object.freeze({
  requestId: "request-1",
  evaluatedAt: "2026-07-29T12:00:00.000Z",
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

async function evaluateInput(value: unknown) {
  let calls = 0;
  let received: InboundAuthenticationInput | null = null;
  const verifier: InboundAuthenticationVerifier = {
    verify(input) {
      calls += 1;
      received = input;
      return { verified: true, evidence: EVIDENCE };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(
    value as InboundAuthenticationInput,
    CONTEXT,
    verifier,
  );
  return { calls, received, result };
}

describe("authentication input descriptors", () => {
  it("rejects an accessor-backed method without invoking it", async () => {
    let getterCalls = 0;
    const input = Object.defineProperty(
      {
        credential: "secret",
        issuerHint: "issuer-1",
        subjectHint: "subject-1",
      },
      "method",
      {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "opaque";
        },
      },
    );

    const { calls, result } = await evaluateInput(input);

    assert.equal(calls, 0);
    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a non-enumerable credential before verifier invocation", async () => {
    const input = {
      method: "opaque",
      issuerHint: "issuer-1",
      subjectHint: "subject-1",
    } as Record<string, unknown>;
    Object.defineProperty(input, "credential", {
      enumerable: false,
      value: "secret",
    });

    const { calls, result } = await evaluateInput(input);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a symbol-keyed input extension before verifier invocation", async () => {
    const input = {
      method: "opaque",
      credential: "secret",
      issuerHint: "issuer-1",
      subjectHint: "subject-1",
      [Symbol("extra")]: true,
    };

    const { calls, result } = await evaluateInput(input);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("forwards an ordinary valid input unchanged exactly once", async () => {
    const input = Object.freeze({
      method: "opaque",
      credential: "secret",
      issuerHint: "issuer-1",
      subjectHint: "subject-1",
    });

    const { calls, received, result } = await evaluateInput(input);

    assert.equal(calls, 1);
    assert.equal(received, input);
    assert.equal(result.verified, true);
  });
});

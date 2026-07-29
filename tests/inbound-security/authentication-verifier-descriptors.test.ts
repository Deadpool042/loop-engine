import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const INPUT = Object.freeze({
  method: "opaque",
  credential: "secret",
  issuerHint: "issuer-1",
  subjectHint: "subject-1",
});

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

async function evaluateVerifier(value: unknown) {
  return evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    value as InboundAuthenticationVerifier,
  );
}

describe("authentication verifier descriptors", () => {
  it("rejects an accessor-backed verify function without invoking the getter", async () => {
    let getterCalls = 0;
    const verifier = Object.defineProperty({}, "verify", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return () => ({ verified: true, evidence: EVIDENCE });
      },
    });

    const result = await evaluateVerifier(verifier);

    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("rejects a non-enumerable verify function", async () => {
    let calls = 0;
    const verifier = Object.defineProperty({}, "verify", {
      enumerable: false,
      value() {
        calls += 1;
        return { verified: true, evidence: EVIDENCE };
      },
    });

    const result = await evaluateVerifier(verifier);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("rejects a symbol-keyed verifier extension before invocation", async () => {
    let calls = 0;
    const verifier = {
      verify() {
        calls += 1;
        return { verified: true as const, evidence: EVIDENCE };
      },
      [Symbol("extra")]: true,
    };

    const result = await evaluateVerifier(verifier);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("invokes an ordinary verifier exactly once with its original receiver", async () => {
    let calls = 0;
    let receiver: unknown = null;
    const verifier: InboundAuthenticationVerifier = {
      verify(input, context) {
        calls += 1;
        receiver = this;
        assert.equal(input, INPUT);
        assert.equal(context, CONTEXT);
        return { verified: true, evidence: EVIDENCE };
      },
    };

    const result = await evaluateVerifier(verifier);

    assert.equal(calls, 1);
    assert.equal(receiver, verifier);
    assert.equal(result.verified, true);
  });
});

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

async function evaluateThenable(thenable: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return thenable as ReturnType<InboundAuthenticationVerifier["verify"]>;
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
  return { calls, result };
}

describe("authentication verifier thenable settlement", () => {
  it("accepts a thenable that resolves once with valid evidence", async () => {
    let thenCalls = 0;
    const thenable = {
      then(resolve: (value: unknown) => void) {
        thenCalls += 1;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    const { calls, result } = await evaluateThenable(thenable);

    assert.equal(calls, 1);
    assert.equal(thenCalls, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, EVIDENCE);
    }
  });

  it("honors the first resolution when a thenable settles twice", async () => {
    const thenable = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        resolve({ verified: false, reason: "rejected" });
        reject(new Error("late rejection"));
        resolve({ verified: false, reason: "unavailable" });
      },
    };

    const { calls, result } = await evaluateThenable(thenable);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_rejected",
    });
  });

  it("canonicalizes a thenable that rejects before later resolution", async () => {
    const thenable = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        reject(new Error("first rejection"));
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    const { calls, result } = await evaluateThenable(thenable);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });
});

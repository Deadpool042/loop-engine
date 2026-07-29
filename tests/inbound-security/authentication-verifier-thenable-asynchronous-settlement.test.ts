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

async function evaluate(result: unknown) {
  let verifierCalls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      verifierCalls += 1;
      return result as ReturnType<InboundAuthenticationVerifier["verify"]>;
    },
  };

  const value = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
  return { verifierCalls, value };
}

const INVALID = Object.freeze({
  verified: false as const,
  reason: "verification_invalid" as const,
});

describe("authentication verifier asynchronous thenable settlement", () => {
  it("preserves an asynchronous first resolution over a later rejection", async () => {
    let thenCalls = 0;
    const result = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        thenCalls += 1;
        queueMicrotask(() => {
          resolve({ verified: true, evidence: EVIDENCE });
          reject(new Error("late rejection"));
        });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("preserves an asynchronous first rejection over a later resolution", async () => {
    let thenCalls = 0;
    const result = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        thenCalls += 1;
        queueMicrotask(() => {
          reject(new Error("initial rejection"));
          resolve({ verified: true, evidence: EVIDENCE });
        });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("preserves the first nested asynchronous settlement", async () => {
    let outerCalls = 0;
    let innerCalls = 0;
    const result = {
      then(resolve: (value: unknown) => void) {
        outerCalls += 1;
        resolve({
          then(innerResolve: (value: unknown) => void, innerReject: (reason: unknown) => void) {
            innerCalls += 1;
            queueMicrotask(() => {
              innerResolve({ verified: true, evidence: EVIDENCE });
              innerReject(new Error("late nested rejection"));
            });
          },
        });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(outerCalls, 1);
    assert.equal(innerCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

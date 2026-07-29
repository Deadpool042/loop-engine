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

const INVALID = Object.freeze({
  verified: false as const,
  reason: "verification_invalid" as const,
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

describe("authentication verifier inherited then semantics", () => {
  it("uses the derived object as receiver for an inherited getter and then function", async () => {
    let getterCalls = 0;
    let getterReceiverMatches = false;
    let thenCalls = 0;
    let thenReceiverMatches = false;
    let result!: object;

    const prototype = Object.defineProperty({}, "then", {
      get() {
        getterCalls += 1;
        getterReceiverMatches = this === result;
        return function (this: unknown, resolve: (value: unknown) => void) {
          thenCalls += 1;
          thenReceiverMatches = this === result;
          resolve({ verified: true, evidence: EVIDENCE });
        };
      },
    });
    result = Object.create(prototype) as object;

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(getterCalls, 1);
    assert.equal(getterReceiverMatches, true);
    assert.equal(thenCalls, 1);
    assert.equal(thenReceiverMatches, true);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes a throwing inherited then getter exactly once", async () => {
    let getterCalls = 0;
    const prototype = Object.defineProperty({}, "then", {
      get() {
        getterCalls += 1;
        throw new Error("inherited then getter failure");
      },
    });
    const result = Object.create(prototype) as object;

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(getterCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("does not invoke an inherited then when a non-callable own property shadows it", async () => {
    let inheritedThenCalls = 0;
    const prototype = {
      then(resolve: (value: unknown) => void) {
        inheritedThenCalls += 1;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };
    const result = Object.create(prototype) as object;
    Object.defineProperty(result, "then", {
      configurable: true,
      value: 42,
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(inheritedThenCalls, 0);
    assert.deepEqual(value, INVALID);
  });
});

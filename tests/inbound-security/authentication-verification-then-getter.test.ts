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

describe("authentication verifier then accessor capture semantics", () => {
  it("invokes an accessor-provided then function with the thenable as receiver", async () => {
    let thenReads = 0;
    let receiverMatches = false;
    const result = Object.defineProperty({}, "then", {
      get() {
        thenReads += 1;
        return function (this: unknown, resolve: (value: unknown) => void) {
          receiverMatches = this === result;
          resolve({ verified: true, evidence: EVIDENCE });
        };
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.equal(receiverMatches, true);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("uses the then function captured by the first accessor read", async () => {
    let thenReads = 0;
    let replacementCalls = 0;
    let result: object;

    result = Object.defineProperty({}, "then", {
      configurable: true,
      get() {
        thenReads += 1;
        Object.defineProperty(result, "then", {
          configurable: true,
          value() {
            replacementCalls += 1;
            throw new Error("replacement then must not run");
          },
        });
        return (resolve: (value: unknown) => void) => {
          resolve({ verified: true, evidence: EVIDENCE });
        };
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.equal(replacementCalls, 0);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("ignores a throw after an accessor-provided then function resolves", async () => {
    let thenReads = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        thenReads += 1;
        return (resolve: (value: unknown) => void) => {
          resolve({ verified: true, evidence: EVIDENCE });
          throw new Error("late accessor-provided then throw");
        };
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

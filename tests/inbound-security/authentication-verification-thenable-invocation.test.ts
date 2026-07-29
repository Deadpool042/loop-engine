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

describe("authentication verifier thenable invocation", () => {
  it("invokes then with the thenable as its receiver", async () => {
    let receiverMatches = false;
    const result = {
      then(this: unknown, resolve: (value: unknown) => void) {
        receiverMatches = this === result;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(receiverMatches, true);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("provides callable resolve and reject handlers exactly once", async () => {
    let thenCalls = 0;
    let resolveType: string | undefined;
    let rejectType: string | undefined;
    const result = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        thenCalls += 1;
        resolveType = typeof resolve;
        rejectType = typeof reject;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenCalls, 1);
    assert.equal(resolveType, "function");
    assert.equal(rejectType, "function");
    assert.equal(value.verified, true);
  });

  it("ignores an exception thrown after successful resolution", async () => {
    const result = {
      then(resolve: (value: unknown) => void) {
        resolve({ verified: true, evidence: EVIDENCE });
        throw new Error("late throw");
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

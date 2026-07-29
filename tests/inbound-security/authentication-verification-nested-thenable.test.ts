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

describe("authentication verifier nested thenable settlement", () => {
  it("assimilates a nested thenable that resolves with valid evidence", async () => {
    let outerThenCalls = 0;
    let innerThenCalls = 0;
    const inner = {
      then(resolve: (value: unknown) => void) {
        innerThenCalls += 1;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };
    const outer = {
      then(resolve: (value: unknown) => void) {
        outerThenCalls += 1;
        resolve(inner);
      },
    };

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.equal(outerThenCalls, 1);
    assert.equal(innerThenCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes a nested thenable rejection", async () => {
    const inner = {
      then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        reject(new Error("nested rejection"));
      },
    };
    const outer = {
      then(resolve: (value: unknown) => void) {
        resolve(inner);
      },
    };

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("keeps the first nested settlement", async () => {
    const inner = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        resolve({ verified: true, evidence: EVIDENCE });
        reject(new Error("late nested rejection"));
      },
    };
    const outer = {
      then(resolve: (value: unknown) => void) {
        resolve(inner);
      },
    };

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

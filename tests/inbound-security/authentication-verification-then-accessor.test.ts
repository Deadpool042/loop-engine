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

describe("authentication verifier then accessor semantics", () => {
  it("reads the then accessor exactly once", async () => {
    let accessorReads = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        accessorReads += 1;
        return (resolve: (value: unknown) => void) => {
          resolve({ verified: true, evidence: EVIDENCE });
        };
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(accessorReads, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes a throwing then accessor", async () => {
    let accessorReads = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        accessorReads += 1;
        throw new Error("then accessor failure");
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(accessorReads, 1);
    assert.deepEqual(value, INVALID);
  });

  it("treats a non-callable then accessor as an invalid verification result", async () => {
    let accessorReads = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        accessorReads += 1;
        return 42;
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(accessorReads, 1);
    assert.deepEqual(value, INVALID);
  });
});

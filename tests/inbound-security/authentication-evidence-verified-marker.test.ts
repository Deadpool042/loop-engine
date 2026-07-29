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
  issuerHint: null,
  subjectHint: null,
});

const CONTEXT = Object.freeze({
  requestId: "request-1",
  evaluatedAt: "2026-07-29T12:00:00.000Z",
});

function evidence(): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-29T11:00:00.000Z",
    validFrom: "2026-07-29T11:00:00.000Z",
    expiresAt: "2026-07-29T13:00:00.000Z",
  });
}

async function evaluate(rawEvidence: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return {
        verified: true as const,
        evidence: rawEvidence as InboundAuthenticationEvidence,
      };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    verifier,
  );

  return { calls, result };
}

describe("authentication evidence verified marker", () => {
  for (const [label, rawEvidence] of [
    ["false", { ...evidence(), verified: false }],
    ["missing", (() => {
      const { verified: _verified, ...rest } = evidence();
      return rest;
    })()],
    ["string", { ...evidence(), verified: "true" }],
    ["number", { ...evidence(), verified: 1 }],
    ["null", { ...evidence(), verified: null }],
  ] as const) {
    it(`rejects a ${label} verified marker after exactly one verifier call`, async () => {
      const { calls, result } = await evaluate(rawEvidence);

      assert.equal(calls, 1);
      assert.deepEqual(result, {
        verified: false,
        reason: "verification_invalid",
      });
    });
  }

  it("accepts the literal true marker without changing evidence identity", async () => {
    const trustedEvidence = evidence();
    const { calls, result } = await evaluate(trustedEvidence);

    assert.equal(calls, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, trustedEvidence);
    }
  });
});

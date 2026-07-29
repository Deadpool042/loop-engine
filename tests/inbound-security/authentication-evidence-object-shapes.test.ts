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
  evaluatedAt: "2026-07-29T10:00:00.000Z",
});

const BASE_EVIDENCE = Object.freeze({
  evidenceId: "evidence-1",
  method: "opaque",
  subjectId: "subject-1",
  issuerId: "issuer-1",
  credentialFingerprint: "fingerprint-1",
  verified: true,
  issuedAt: "2026-07-29T09:00:00.000Z",
  validFrom: "2026-07-29T09:00:00.000Z",
  expiresAt: "2026-07-29T11:00:00.000Z",
});

async function evaluateEvidence(value: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return {
        verified: true,
        evidence: value as InboundAuthenticationEvidence,
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

describe("authentication evidence object shapes", () => {
  for (const [name, create] of [
    [
      "null-prototype object",
      () => Object.assign(Object.create(null) as object, BASE_EVIDENCE),
    ],
    [
      "array",
      () => Object.assign([] as unknown[], BASE_EVIDENCE),
    ],
    [
      "class instance",
      () => {
        class EvidenceRecord {}
        return Object.assign(new EvidenceRecord(), BASE_EVIDENCE);
      },
    ],
  ] as const) {
    it(`rejects ${name}`, async () => {
      const { calls, result } = await evaluateEvidence(create());

      assert.equal(calls, 1);
      assert.deepEqual(result, {
        verified: false,
        reason: "verification_invalid",
      });
    });
  }

  it("accepts an ordinary evidence object unchanged", async () => {
    const trustedEvidence = Object.freeze({ ...BASE_EVIDENCE });
    const { calls, result } = await evaluateEvidence(trustedEvidence);

    assert.equal(calls, 1);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, trustedEvidence);
    }
  });
});

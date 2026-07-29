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

function evidence(
  overrides: Partial<InboundAuthenticationEvidence> = {},
): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "subject-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fingerprint-1",
    verified: true,
    issuedAt: "2026-07-29T09:00:00.000Z",
    validFrom: "2026-07-29T09:00:00.000Z",
    expiresAt: "2026-07-29T11:00:00.000Z",
    ...overrides,
  });
}

describe("authentication evidence core identifiers", () => {
  for (const [field, value] of [
    ["evidenceId", ""],
    ["evidenceId", "   "],
    ["method", ""],
    ["method", "   "],
    ["credentialFingerprint", ""],
    ["credentialFingerprint", "   "],
  ] as const) {
    it(`rejects blank ${field}`, async () => {
      let calls = 0;
      const verifier: InboundAuthenticationVerifier = {
        verify() {
          calls += 1;
          return {
            verified: true,
            evidence: evidence({ [field]: value }),
          };
        },
      };

      const result = await evaluateInboundAuthenticationVerifier(
        INPUT,
        CONTEXT,
        verifier,
      );

      assert.equal(calls, 1);
      assert.deepEqual(result, {
        verified: false,
        reason: "verification_invalid",
      });
    });
  }

  it("preserves valid core identifiers unchanged", async () => {
    const trustedEvidence = evidence();
    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      { verify: () => ({ verified: true, evidence: trustedEvidence }) },
    );

    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, trustedEvidence);
      assert.equal(result.evidence.evidenceId, "evidence-1");
      assert.equal(result.evidence.method, "opaque");
      assert.equal(result.evidence.credentialFingerprint, "fingerprint-1");
    }
  });
});

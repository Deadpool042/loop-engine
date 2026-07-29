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
  evaluatedAt: "2026-07-29T06:00:00.000Z",
});

function evidence(
  overrides: Partial<InboundAuthenticationEvidence> = {},
): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-29T05:00:00.000Z",
    validFrom: "2026-07-29T05:00:00.000Z",
    expiresAt: "2026-07-29T07:00:00.000Z",
    ...overrides,
  });
}

function verifier(value: InboundAuthenticationEvidence): InboundAuthenticationVerifier {
  return {
    verify() {
      return { verified: true as const, evidence: value };
    },
  };
}

describe("inbound authentication issuedAt validation", () => {
  it("rejects malformed issuedAt after exactly one verifier invocation", async () => {
    let calls = 0;
    const port: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        return {
          verified: true as const,
          evidence: evidence({ issuedAt: "not-an-instant" }),
        };
      },
    };

    const result = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, port);

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 1);
  });

  it("rejects evidence issued after its expiry", async () => {
    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      verifier(
        evidence({
          issuedAt: "2026-07-29T07:00:00.001Z",
          expiresAt: "2026-07-29T07:00:00.000Z",
        }),
      ),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("accepts issuedAt equal to expiresAt", async () => {
    const trustedEvidence = evidence({
      issuedAt: "2026-07-29T07:00:00.000Z",
      validFrom: "2026-07-29T06:00:00.000Z",
      expiresAt: "2026-07-29T07:00:00.000Z",
    });
    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      verifier(trustedEvidence),
    );

    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, trustedEvidence);
    }
  });

  it("accepts a parseable issuedAt without changing evidence identity", async () => {
    const trustedEvidence = evidence();
    const result = await evaluateInboundAuthenticationVerifier(
      INPUT,
      CONTEXT,
      verifier(trustedEvidence),
    );

    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, trustedEvidence);
    }
  });
});

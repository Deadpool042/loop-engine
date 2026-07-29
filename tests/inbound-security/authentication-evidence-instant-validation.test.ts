import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const INPUT = Object.freeze({
  method: "opaque",
  credential: "raw-secret-never-forward",
  issuerHint: null,
  subjectHint: null,
});

const CONTEXT = Object.freeze({
  requestId: "request-1",
  evaluatedAt: "2026-07-26T12:00:00.000Z",
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
    issuedAt: "2026-07-26T11:00:00.000Z",
    validFrom: "2026-07-26T11:00:00.000Z",
    expiresAt: "2026-07-26T13:00:00.000Z",
    ...overrides,
  });
}

async function evaluate(trustedEvidence: InboundAuthenticationEvidence) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return { verified: true as const, evidence: trustedEvidence };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    verifier,
  );

  return { calls, result };
}

describe("authentication evidence instant validation", () => {
  it("rejects an unparseable validFrom after exactly one verifier call", async () => {
    const { calls, result } = await evaluate(evidence({ validFrom: "not-an-instant" }));

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects an unparseable expiresAt after exactly one verifier call", async () => {
    const { calls, result } = await evaluate(evidence({ expiresAt: "not-an-instant" }));

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("still rejects an inverted parseable validity window", async () => {
    const { result } = await evaluate(
      evidence({
        validFrom: "2026-07-26T14:00:00.000Z",
        expiresAt: "2026-07-26T13:00:00.000Z",
      }),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("accepts equal parseable validity bounds", async () => {
    const bound = "2026-07-26T12:00:00.000Z";
    const { calls, result } = await evaluate(
      evidence({ validFrom: bound, expiresAt: bound }),
    );

    assert.equal(calls, 1);
    assert.equal(result.verified, true);
  });
});

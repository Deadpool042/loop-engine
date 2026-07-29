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

async function evaluate(
  overrides: Partial<InboundAuthenticationEvidence>,
) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return { verified: true as const, evidence: evidence(overrides) };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    verifier,
  );

  return { calls, result };
}

describe("authentication evidence blank instants", () => {
  it("rejects empty and whitespace-only issuedAt, validFrom, and expiresAt", async () => {
    for (const overrides of [
      { issuedAt: "" },
      { issuedAt: "   " },
      { validFrom: "" },
      { validFrom: "   " },
      { expiresAt: "" },
      { expiresAt: "   " },
    ]) {
      const { calls, result } = await evaluate(overrides);

      assert.equal(calls, 1);
      assert.deepEqual(result, {
        verified: false,
        reason: "verification_invalid",
      });
    }
  });
});

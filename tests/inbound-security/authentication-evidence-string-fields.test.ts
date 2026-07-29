import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

const INPUT = Object.freeze({
  method: "opaque",
  credential: "super-secret-material",
  issuerHint: "issuer-1",
  subjectHint: "principal-1",
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

async function evaluate(
  overrides: Partial<InboundAuthenticationEvidence>,
) {
  const verifier: InboundAuthenticationVerifier = {
    verify: () => ({ verified: true, evidence: evidence(overrides) }),
  };

  return evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
}

describe("authentication evidence string fields", () => {
  it("rejects blank evidenceId, method, and credentialFingerprint values", async () => {
    for (const overrides of [
      { evidenceId: "" },
      { evidenceId: "   " },
      { method: "" },
      { method: "   " },
      { credentialFingerprint: "" },
      { credentialFingerprint: "   " },
    ]) {
      assert.deepEqual(await evaluate(overrides), {
        verified: false,
        reason: "verification_invalid",
      });
    }
  });
});

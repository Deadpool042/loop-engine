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

const EVIDENCE: InboundAuthenticationEvidence = Object.freeze({
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

async function evaluateVerifier(value: unknown) {
  return evaluateInboundAuthenticationVerifier(
    INPUT,
    CONTEXT,
    value as InboundAuthenticationVerifier,
  );
}

describe("authentication verifier object descriptors", () => {
  it("rejects a non-enumerable verify method", async () => {
    const verifier = {} as Record<string, unknown>;
    Object.defineProperty(verifier, "verify", {
      enumerable: false,
      value: () => ({ verified: true, evidence: EVIDENCE }),
    });

    assert.deepEqual(await evaluateVerifier(verifier), {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("rejects a symbol-keyed verifier extension", async () => {
    const verifier = {
      verify: () => ({ verified: true, evidence: EVIDENCE }),
      [Symbol("extra")]: true,
    };

    assert.deepEqual(await evaluateVerifier(verifier), {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  for (const [name, verifier] of [
    ["null-prototype object", Object.assign(Object.create(null) as object, { verify() {} })],
    ["array", Object.assign([] as unknown[], { verify() {} })],
    [
      "class instance",
      Object.assign(new (class VerifierRecord {})(), { verify() {} }),
    ],
  ] as const) {
    it(`rejects ${name}`, async () => {
      assert.deepEqual(await evaluateVerifier(verifier), {
        verified: false,
        reason: "verification_unavailable",
      });
    });
  }

  it("invokes an ordinary verifier exactly once while preserving this", async () => {
    let calls = 0;
    let preservedThis = false;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        preservedThis = this === verifier;
        return { verified: true, evidence: EVIDENCE };
      },
    };

    const result = await evaluateVerifier(verifier);

    assert.equal(calls, 1);
    assert.equal(preservedThis, true);
    assert.equal(result.verified, true);
    if (result.verified) {
      assert.equal(result.evidence, EVIDENCE);
    }
  });
});

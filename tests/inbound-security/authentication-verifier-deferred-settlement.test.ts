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

describe("authentication verifier deferred thenable settlement", () => {
  it("accepts valid evidence resolved from a microtask", async () => {
    const result = {
      then(resolve: (value: unknown) => void) {
        queueMicrotask(() => resolve({ verified: true, evidence: EVIDENCE }));
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes rejection delivered from a microtask", async () => {
    const result = {
      then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        queueMicrotask(() => reject(new Error("deferred rejection")));
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("keeps the first deferred settlement", async () => {
    const result = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        queueMicrotask(() => resolve({ verified: true, evidence: EVIDENCE }));
        queueMicrotask(() => reject(new Error("late rejection")));
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

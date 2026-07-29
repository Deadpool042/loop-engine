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

async function evaluate(result: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return result as ReturnType<InboundAuthenticationVerifier["verify"]>;
    },
  };

  const value = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
  return { calls, value };
}

describe("authentication verifier nested thenable assimilation", () => {
  it("assimilates nested thenables and preserves evidence identity", async () => {
    let outerCalls = 0;
    let innerCalls = 0;
    const nested = {
      then(resolve: (value: unknown) => void) {
        outerCalls += 1;
        resolve({
          then(innerResolve: (value: unknown) => void) {
            innerCalls += 1;
            innerResolve({ verified: true, evidence: EVIDENCE });
          },
        });
      },
    };

    const { calls, value } = await evaluate(nested);

    assert.equal(calls, 1);
    assert.equal(outerCalls, 1);
    assert.equal(innerCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes rejection from an inner thenable", async () => {
    const nested = {
      then(resolve: (value: unknown) => void) {
        resolve({
          then(_innerResolve: (value: unknown) => void, reject: (reason: unknown) => void) {
            reject(new Error("inner rejection"));
          },
        });
      },
    };

    const { calls, value } = await evaluate(nested);

    assert.equal(calls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("honors an unavailable first settlement of the inner thenable", async () => {
    const nested = {
      then(resolve: (value: unknown) => void) {
        resolve({
          then(innerResolve: (value: unknown) => void, reject: (reason: unknown) => void) {
            innerResolve({ verified: false, reason: "unavailable" });
            reject(new Error("late rejection"));
          },
        });
      },
    };

    const { calls, value } = await evaluate(nested);

    assert.equal(calls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("honors a successful first settlement of the inner thenable", async () => {
    const nested = {
      then(resolve: (value: unknown) => void) {
        resolve({
          then(innerResolve: (value: unknown) => void, reject: (reason: unknown) => void) {
            innerResolve({ verified: true, evidence: EVIDENCE });
            reject(new Error("late rejection"));
          },
        });
      },
    };

    const { calls, value } = await evaluate(nested);

    assert.equal(calls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

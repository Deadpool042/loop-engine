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

function evidence(): InboundAuthenticationEvidence {
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
  });
}

async function evaluateEvidence(value: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return { verified: true, evidence: value as InboundAuthenticationEvidence };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
  return { calls, result };
}

describe("authentication evidence descriptors", () => {
  it("rejects accessor-backed evidence fields without invoking getters", async () => {
    let getterCalls = 0;
    const value = { ...evidence() } as Record<string, unknown>;
    Object.defineProperty(value, "subjectId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "subject-1";
      },
    });

    const { calls, result } = await evaluateEvidence(value);

    assert.equal(calls, 1);
    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects non-enumerable required evidence fields", async () => {
    const value = { ...evidence() } as Record<string, unknown>;
    Object.defineProperty(value, "issuerId", {
      enumerable: false,
      value: "issuer-1",
    });

    const { calls, result } = await evaluateEvidence(value);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects symbol-keyed evidence extensions", async () => {
    const value = { ...evidence(), [Symbol("extra")]: true };

    const { calls, result } = await evaluateEvidence(value);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });
});

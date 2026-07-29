import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationEvidence,
  type InboundAuthenticationInput,
  type InboundAuthenticationVerifier,
} from "../../src/inbound-security/index.js";

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

function input(metadata: unknown): InboundAuthenticationInput {
  return {
    method: "opaque",
    credential: "secret",
    issuerHint: "issuer-1",
    subjectHint: "subject-1",
    metadata: metadata as Readonly<Record<string, string>>,
  };
}

async function evaluateMetadata(metadata: unknown) {
  let calls = 0;
  let received: InboundAuthenticationInput | null = null;
  const value = input(metadata);
  const verifier: InboundAuthenticationVerifier = {
    verify(candidate) {
      calls += 1;
      received = candidate;
      return { verified: true, evidence: EVIDENCE };
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(value, CONTEXT, verifier);
  return { calls, received, result, value };
}

describe("authentication metadata descriptors", () => {
  it("rejects an accessor-backed metadata value without invoking it", async () => {
    let getterCalls = 0;
    const metadata = Object.defineProperty({}, "tenant", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "tenant-1";
      },
    });

    const { calls, result } = await evaluateMetadata(metadata);

    assert.equal(calls, 0);
    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a non-enumerable metadata entry before verifier invocation", async () => {
    const metadata = {} as Record<string, unknown>;
    Object.defineProperty(metadata, "tenant", {
      enumerable: false,
      value: "tenant-1",
    });

    const { calls, result } = await evaluateMetadata(metadata);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a symbol-keyed metadata entry before verifier invocation", async () => {
    const metadata = {
      tenant: "tenant-1",
      [Symbol("extra")]: "hidden",
    };

    const { calls, result } = await evaluateMetadata(metadata);

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("forwards ordinary metadata unchanged across exactly one verifier call", async () => {
    const metadata = Object.freeze({ tenant: "tenant-1", channel: "api" });
    const { calls, received, result, value } = await evaluateMetadata(metadata);

    assert.equal(calls, 1);
    assert.equal(received, value);
    assert.equal(received?.metadata, metadata);
    assert.equal(result.verified, true);
  });
});

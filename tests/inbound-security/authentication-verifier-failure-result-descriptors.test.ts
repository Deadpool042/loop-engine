import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundAuthenticationVerifier,
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

async function evaluateResult(result: unknown) {
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

describe("authentication verifier failure result descriptors", () => {
  it("rejects an accessor-backed reason without invoking the getter", async () => {
    let getterCalls = 0;
    const result = Object.defineProperty({ verified: false }, "reason", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "rejected";
      },
    });

    const { calls, value } = await evaluateResult(result);

    assert.equal(calls, 1);
    assert.equal(getterCalls, 0);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a non-enumerable reason", async () => {
    const result = { verified: false } as Record<string, unknown>;
    Object.defineProperty(result, "reason", {
      enumerable: false,
      value: "rejected",
    });

    const { calls, value } = await evaluateResult(result);

    assert.equal(calls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a symbol-keyed failure result extension", async () => {
    const { calls, value } = await evaluateResult({
      verified: false,
      reason: "rejected",
      [Symbol("extra")]: true,
    });

    assert.equal(calls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("canonicalizes ordinary rejected and unavailable results", async () => {
    const rejected = await evaluateResult({ verified: false, reason: "rejected" });
    const unavailable = await evaluateResult({ verified: false, reason: "unavailable" });

    assert.equal(rejected.calls, 1);
    assert.deepEqual(rejected.value, {
      verified: false,
      reason: "verification_rejected",
    });
    assert.equal(unavailable.calls, 1);
    assert.deepEqual(unavailable.value, {
      verified: false,
      reason: "verification_unavailable",
    });
  });
});

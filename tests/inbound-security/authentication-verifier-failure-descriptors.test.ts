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
  evaluatedAt: "2026-07-29T10:00:00.000Z",
});

async function evaluateResult(value: unknown) {
  let calls = 0;
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls += 1;
      return value as ReturnType<InboundAuthenticationVerifier["verify"]>;
    },
  };

  const result = await evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
  return { calls, result };
}

describe("authentication verifier failure descriptors", () => {
  it("rejects an accessor-backed reason without invoking it", async () => {
    let getterCalls = 0;
    const value = Object.defineProperty({ verified: false }, "reason", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "rejected";
      },
    });

    const { calls, result } = await evaluateResult(value);

    assert.equal(calls, 1);
    assert.equal(getterCalls, 0);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a non-enumerable failure reason", async () => {
    const value = { verified: false } as Record<string, unknown>;
    Object.defineProperty(value, "reason", {
      enumerable: false,
      value: "rejected",
    });

    const { calls, result } = await evaluateResult(value);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  it("rejects a symbol-keyed failure extension", async () => {
    const value = {
      verified: false,
      reason: "rejected",
      [Symbol("extra")]: true,
    };

    const { calls, result } = await evaluateResult(value);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
  });

  for (const [reason, expected] of [
    ["rejected", "verification_rejected"],
    ["unavailable", "verification_unavailable"],
    ["invalid", "verification_invalid"],
  ] as const) {
    it(`canonicalizes ${reason} without exposing the verifier object`, async () => {
      const value = Object.freeze({ verified: false, reason });
      const { calls, result } = await evaluateResult(value);

      assert.equal(calls, 1);
      assert.deepEqual(result, { verified: false, reason: expected });
      assert.notEqual(result, value);
      assert.equal(Object.isFrozen(result), true);
    });
  }
});

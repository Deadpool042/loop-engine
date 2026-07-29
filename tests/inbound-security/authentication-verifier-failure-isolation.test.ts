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

async function evaluate(verifier: InboundAuthenticationVerifier) {
  return evaluateInboundAuthenticationVerifier(INPUT, CONTEXT, verifier);
}

const INVALID = Object.freeze({
  verified: false as const,
  reason: "verification_invalid" as const,
});

describe("authentication verifier failure isolation", () => {
  it("canonicalizes a synchronous verifier throw", async () => {
    let calls = 0;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        throw new Error("secret verifier failure");
      },
    };

    assert.deepEqual(await evaluate(verifier), INVALID);
    assert.equal(calls, 1);
  });

  it("canonicalizes a rejected verifier promise", async () => {
    let calls = 0;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        return Promise.reject(new Error("secret asynchronous failure"));
      },
    };

    assert.deepEqual(await evaluate(verifier), INVALID);
    assert.equal(calls, 1);
  });

  it("canonicalizes a throwing then accessor", async () => {
    let calls = 0;
    let thenReads = 0;
    const verifier: InboundAuthenticationVerifier = {
      verify() {
        calls += 1;
        return Object.defineProperty({}, "then", {
          get() {
            thenReads += 1;
            throw new Error("secret then failure");
          },
        }) as ReturnType<InboundAuthenticationVerifier["verify"]>;
      },
    };

    assert.deepEqual(await evaluate(verifier), INVALID);
    assert.equal(calls, 1);
    assert.equal(thenReads, 1);
  });

  it("does not retry after verifier failure", async () => {
    let calls = 0;
    const verifier: InboundAuthenticationVerifier = {
      async verify() {
        calls += 1;
        throw new Error("failure");
      },
    };

    const first = await evaluate(verifier);
    assert.deepEqual(first, INVALID);
    assert.equal(calls, 1);
  });
});

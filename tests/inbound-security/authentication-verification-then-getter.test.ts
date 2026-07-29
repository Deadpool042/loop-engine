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

describe("authentication verifier then accessor settlement", () => {
  it("canonicalizes a throwing then accessor", async () => {
    let thenReads = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        thenReads += 1;
        throw new Error("then accessor failure");
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.deepEqual(value, INVALID);
  });

  it("canonicalizes a nested throwing then accessor", async () => {
    let thenReads = 0;
    const inner = Object.defineProperty({}, "then", {
      get() {
        thenReads += 1;
        throw new Error("nested then accessor failure");
      },
    });
    const outer = {
      then(resolve: (value: unknown) => void) {
        resolve(inner);
      },
    };

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.deepEqual(value, INVALID);
  });

  it("keeps verifier invocation exactly once when reading then throws", async () => {
    const result = Object.defineProperty({}, "then", {
      get() {
        throw new Error("then accessor failure");
      },
    });

    const { verifierCalls } = await evaluate(result);

    assert.equal(verifierCalls, 1);
  });
});

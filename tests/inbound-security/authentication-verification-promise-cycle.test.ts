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

describe("authentication verifier promise cycle settlement", () => {
  it("canonicalizes a promise resolved with itself", async () => {
    let resolveCycle!: (value: unknown) => void;
    const cycle = new Promise((resolve) => {
      resolveCycle = resolve;
    });
    resolveCycle(cycle);

    const { verifierCalls, value } = await evaluate(cycle);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("canonicalizes a nested promise cycle", async () => {
    let resolveCycle!: (value: unknown) => void;
    const cycle = new Promise((resolve) => {
      resolveCycle = resolve;
    });
    resolveCycle(cycle);

    const outer = Promise.resolve(cycle);
    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("keeps verifier invocation exactly once for a rejected cycle", async () => {
    let resolveCycle!: (value: unknown) => void;
    const cycle = new Promise((resolve) => {
      resolveCycle = resolve;
    });
    resolveCycle(cycle);

    const { verifierCalls } = await evaluate(cycle);

    assert.equal(verifierCalls, 1);
  });
});

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

describe("authentication verifier thenable cycles", () => {
  it("canonicalizes a promise that resolves to itself", async () => {
    let resolvePromise!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    queueMicrotask(() => resolvePromise(promise));

    const { verifierCalls, value } = await evaluate(promise);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("canonicalizes a nested promise that resolves to itself", async () => {
    let resolveInner!: (value: unknown) => void;
    const inner = new Promise((resolve) => {
      resolveInner = resolve;
    });
    const outer = Promise.resolve(inner);
    queueMicrotask(() => resolveInner(inner));

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("canonicalizes a promise-chain cycle without leaking the rejection", async () => {
    let cycle!: Promise<unknown>;
    const source = Promise.resolve();
    cycle = source.then(() => cycle);

    const { verifierCalls, value } = await evaluate(cycle);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });
});

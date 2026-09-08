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

describe("authentication verifier thenables", () => {
  it("invokes then with the thenable as its receiver and callable handlers", async () => {
    let receiverMatches = false;
    let thenCalls = 0;
    let resolveType: string | undefined;
    let rejectType: string | undefined;
    const result = {
      then(this: unknown, resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        thenCalls += 1;
        receiverMatches = this === result;
        resolveType = typeof resolve;
        rejectType = typeof reject;
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(thenCalls, 1);
    assert.equal(receiverMatches, true);
    assert.equal(resolveType, "function");
    assert.equal(rejectType, "function");
    assert.equal(value.verified, true);
    if (value.verified) assert.equal(value.evidence, EVIDENCE);
  });

  it("ignores an exception thrown after successful resolution", async () => {
    const result = {
      then(resolve: (value: unknown) => void) {
        resolve({ verified: true, evidence: EVIDENCE });
        throw new Error("late throw");
      },
    };

    const { verifierCalls, value } = await evaluate(result);
    assert.equal(verifierCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) assert.equal(value.evidence, EVIDENCE);
  });

  it("honors the first synchronous settlement", async () => {
    const resolvedFirst = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        resolve({ verified: false, reason: "rejected" });
        reject(new Error("late rejection"));
        resolve({ verified: false, reason: "unavailable" });
      },
    };
    const rejectedFirst = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        reject(new Error("first rejection"));
        resolve({ verified: true, evidence: EVIDENCE });
      },
    };

    assert.deepEqual((await evaluate(resolvedFirst)).value, {
      verified: false,
      reason: "verification_rejected",
    });
    assert.deepEqual((await evaluate(rejectedFirst)).value, INVALID);
  });

  it("preserves the first asynchronous settlement", async () => {
    const resolvedFirst = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        queueMicrotask(() => {
          resolve({ verified: true, evidence: EVIDENCE });
          reject(new Error("late rejection"));
        });
      },
    };
    const rejectedFirst = {
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        queueMicrotask(() => {
          reject(new Error("initial rejection"));
          resolve({ verified: true, evidence: EVIDENCE });
        });
      },
    };

    const success = await evaluate(resolvedFirst);
    const failure = await evaluate(rejectedFirst);
    assert.equal(success.value.verified, true);
    assert.deepEqual(failure.value, INVALID);
  });

  it("preserves the first nested asynchronous settlement", async () => {
    let outerCalls = 0;
    let innerCalls = 0;
    const result = {
      then(resolve: (value: unknown) => void) {
        outerCalls += 1;
        resolve({
          then(innerResolve: (value: unknown) => void, innerReject: (reason: unknown) => void) {
            innerCalls += 1;
            queueMicrotask(() => {
              innerResolve({ verified: true, evidence: EVIDENCE });
              innerReject(new Error("late nested rejection"));
            });
          },
        });
      },
    };

    const { verifierCalls, value } = await evaluate(result);
    assert.equal(verifierCalls, 1);
    assert.equal(outerCalls, 1);
    assert.equal(innerCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) assert.equal(value.evidence, EVIDENCE);
  });

  it("canonicalizes self-resolving promise cycles", async () => {
    let resolvePromise!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    queueMicrotask(() => resolvePromise(promise));

    const { verifierCalls, value } = await evaluate(promise);
    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("canonicalizes nested self-resolving promise cycles", async () => {
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

  it("canonicalizes promise-chain cycles without leaking rejection", async () => {
    let cycle!: Promise<unknown>;
    const source = Promise.resolve();
    cycle = source.then(() => cycle);

    const { verifierCalls, value } = await evaluate(cycle);
    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });
});

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

describe("authentication verifier proxy then semantics", () => {
  it("uses the proxy as receiver for both then lookup and invocation", async () => {
    let thenReads = 0;
    let lookupReceiverMatches = false;
    let invocationReceiverMatches = false;
    let proxy!: object;

    proxy = new Proxy(
      {},
      {
        get(target, property, receiver) {
          if (property !== "then") {
            return Reflect.get(target, property, receiver);
          }

          thenReads += 1;
          lookupReceiverMatches = receiver === proxy;
          return function (this: unknown, resolve: (value: unknown) => void) {
            invocationReceiverMatches = this === proxy;
            resolve({ verified: true, evidence: EVIDENCE });
          };
        },
      },
    );

    const { verifierCalls, value } = await evaluate(proxy);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.equal(lookupReceiverMatches, true);
    assert.equal(invocationReceiverMatches, true);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("canonicalizes a proxy revoked before then lookup", async () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();

    const { verifierCalls, value } = await evaluate(revocable.proxy);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, INVALID);
  });

  it("uses a then function captured before the proxy revokes itself", async () => {
    let thenReads = 0;
    let invocationReceiverMatches = false;
    let proxy!: object;
    let revoke!: () => void;

    const revocable = Proxy.revocable(
      {},
      {
        get(target, property, receiver) {
          if (property !== "then") {
            return Reflect.get(target, property, receiver);
          }

          thenReads += 1;
          revoke();
          return function (this: unknown, resolve: (value: unknown) => void) {
            invocationReceiverMatches = this === proxy;
            resolve({ verified: true, evidence: EVIDENCE });
          };
        },
      },
    );
    proxy = revocable.proxy;
    revoke = revocable.revoke;

    const { verifierCalls, value } = await evaluate(proxy);

    assert.equal(verifierCalls, 1);
    assert.equal(thenReads, 1);
    assert.equal(invocationReceiverMatches, true);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });
});

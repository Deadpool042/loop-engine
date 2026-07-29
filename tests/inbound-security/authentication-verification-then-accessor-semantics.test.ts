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

describe("authentication verifier then accessor semantics", () => {
  it("reads and invokes an outer then accessor exactly once", async () => {
    let getterCalls = 0;
    let thenCalls = 0;
    const result = Object.defineProperty({}, "then", {
      get() {
        getterCalls += 1;
        return (resolve: (value: unknown) => void) => {
          thenCalls += 1;
          resolve({ verified: false, reason: "unavailable" });
        };
      },
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.equal(getterCalls, 1);
    assert.equal(thenCalls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_unavailable",
    });
  });

  it("reads and invokes a nested then accessor exactly once", async () => {
    let innerGetterCalls = 0;
    let innerThenCalls = 0;
    const inner = Object.defineProperty({}, "then", {
      get() {
        innerGetterCalls += 1;
        return (resolve: (value: unknown) => void) => {
          innerThenCalls += 1;
          resolve({ verified: true, evidence: EVIDENCE });
        };
      },
    });
    const outer = {
      then(resolve: (value: unknown) => void) {
        resolve(inner);
      },
    };

    const { verifierCalls, value } = await evaluate(outer);

    assert.equal(verifierCalls, 1);
    assert.equal(innerGetterCalls, 1);
    assert.equal(innerThenCalls, 1);
    assert.equal(value.verified, true);
    if (value.verified) {
      assert.equal(value.evidence, EVIDENCE);
    }
  });

  it("treats a non-callable then property as a plain invalid result", async () => {
    const result = Object.freeze({
      then: 42,
      verified: true,
      evidence: EVIDENCE,
    });

    const { verifierCalls, value } = await evaluate(result);

    assert.equal(verifierCalls, 1);
    assert.deepEqual(value, {
      verified: false,
      reason: "verification_invalid",
    });
  });
});

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
  evaluatedAt: "2026-07-26T12:00:00.000Z",
});

function input(
  metadata?: Readonly<Record<string, string>>,
): InboundAuthenticationInput {
  return Object.freeze({
    method: "opaque",
    credential: "raw-secret-never-forward",
    issuerHint: null,
    subjectHint: null,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

function evidence(
  metadata?: Readonly<Record<string, string>>,
): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-26T11:00:00.000Z",
    validFrom: "2026-07-26T11:00:00.000Z",
    expiresAt: "2026-07-26T13:00:00.000Z",
    ...(metadata === undefined ? {} : { metadata }),
  });
}

function verifier(
  onVerify: (received: InboundAuthenticationInput) => void = () => {},
  trustedEvidence: InboundAuthenticationEvidence = evidence(),
): InboundAuthenticationVerifier {
  return {
    verify(received) {
      onVerify(received);
      return { verified: true as const, evidence: trustedEvidence };
    },
  };
}

describe("inbound authentication metadata validation", () => {
  it("accepts absent and empty metadata records", async () => {
    const absent = await evaluateInboundAuthenticationVerifier(
      input(),
      CONTEXT,
      verifier(),
    );
    const empty = await evaluateInboundAuthenticationVerifier(
      input(Object.freeze({})),
      CONTEXT,
      verifier(),
    );

    assert.equal(absent.verified, true);
    assert.equal(empty.verified, true);
  });

  it("accepts single-character metadata entries and transmits input unchanged", async () => {
    const metadata = Object.freeze({ k: "v" });
    let received: InboundAuthenticationInput | null = null;

    const result = await evaluateInboundAuthenticationVerifier(
      input(metadata),
      CONTEXT,
      verifier((value) => {
        received = value;
      }),
    );

    assert.equal(result.verified, true);
    assert.equal(received?.metadata, metadata);
  });

  it("rejects a blank input metadata key before invoking the verifier", async () => {
    let calls = 0;
    const result = await evaluateInboundAuthenticationVerifier(
      input(Object.freeze({ "   ": "value" })),
      CONTEXT,
      verifier(() => {
        calls += 1;
      }),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 0);
  });

  it("rejects a blank input metadata value before invoking the verifier", async () => {
    let calls = 0;
    const result = await evaluateInboundAuthenticationVerifier(
      input(Object.freeze({ key: "   " })),
      CONTEXT,
      verifier(() => {
        calls += 1;
      }),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 0);
  });

  it("rejects a blank evidence metadata key after exactly one verifier call", async () => {
    let calls = 0;
    const result = await evaluateInboundAuthenticationVerifier(
      input(),
      CONTEXT,
      verifier(
        () => {
          calls += 1;
        },
        evidence(Object.freeze({ "": "value" })),
      ),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 1);
  });

  it("rejects a blank evidence metadata value after exactly one verifier call", async () => {
    let calls = 0;
    const result = await evaluateInboundAuthenticationVerifier(
      input(),
      CONTEXT,
      verifier(
        () => {
          calls += 1;
        },
        evidence(Object.freeze({ key: "" })),
      ),
    );

    assert.deepEqual(result, {
      verified: false,
      reason: "verification_invalid",
    });
    assert.equal(calls, 1);
  });
});

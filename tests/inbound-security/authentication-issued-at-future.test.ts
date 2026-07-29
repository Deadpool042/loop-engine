import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InboundAuthenticationEvidence } from "../../src/inbound-security/index.js";
import { isEvidenceNotYetValid } from "../../src/inbound-security/validation.js";

const EVALUATED_AT = "2026-07-26T12:00:00.000Z";

function evidence(
  overrides: Partial<InboundAuthenticationEvidence> = {},
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
    ...overrides,
  });
}

describe("future-issued inbound authentication evidence", () => {
  it("rejects evidence issued after the explicit evaluation instant", () => {
    assert.equal(
      isEvidenceNotYetValid(
        evidence({ issuedAt: "2026-07-26T12:00:01.000Z" }),
        EVALUATED_AT,
      ),
      true,
    );
  });

  it("accepts evidence issued exactly at the explicit evaluation instant", () => {
    assert.equal(
      isEvidenceNotYetValid(evidence({ issuedAt: EVALUATED_AT }), EVALUATED_AT),
      false,
    );
  });
});

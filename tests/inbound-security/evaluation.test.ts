import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { evaluateInboundSecurity } from "../../src/inbound-security/evaluation.js";
import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationEvidence,
  InboundPrincipal,
  InboundReplayEvidence,
  InboundSecurityEvaluationInput,
} from "../../src/inbound-security/types.js";

const EVALUATED_AT = "2026-07-26T12:00:00.000Z";

function evidence(
  overrides: Partial<InboundAuthenticationEvidence> = {},
): InboundAuthenticationEvidence {
  return {
    evidenceId: "evidence-1",
    method: "bearer_token",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-26T11:00:00.000Z",
    validFrom: "2026-07-26T11:00:00.000Z",
    expiresAt: "2026-07-26T13:00:00.000Z",
    ...overrides,
  };
}

function principal(overrides: Partial<InboundPrincipal> = {}): InboundPrincipal {
  return {
    principalId: "principal-1",
    principalType: "user",
    tenantId: "tenant-1",
    roles: ["operator"],
    ...overrides,
  };
}

function accessRequest(
  overrides: Partial<InboundAccessRequest> = {},
): InboundAccessRequest {
  return {
    requestId: "request-1",
    principalId: "principal-1",
    tenantId: "tenant-1",
    project: "loop-engine",
    operation: "execute",
    ...overrides,
  };
}

function replayEvidence(
  overrides: Partial<InboundReplayEvidence> = {},
): InboundReplayEvidence {
  return {
    requestId: "request-1",
    evidenceId: "evidence-1",
    receivedAt: EVALUATED_AT,
    nonce: "nonce-1",
    replayed: false,
    ...overrides,
  };
}

function policy(overrides: Partial<InboundAccessPolicy> = {}): InboundAccessPolicy {
  return {
    allowedOperations: ["execute", "dry-run"],
    replayCheckRequired: true,
    ...overrides,
  };
}

function input(
  overrides: Partial<InboundSecurityEvaluationInput> = {},
): InboundSecurityEvaluationInput {
  return {
    evidence: evidence(),
    principal: principal(),
    accessRequest: accessRequest(),
    replayEvidence: replayEvidence(),
    policy: policy(),
    ...overrides,
  };
}

describe("evaluateInboundSecurity", () => {
  it("denies when authentication evidence is missing", () => {
    const decision = evaluateInboundSecurity(
      input({ evidence: null }),
      EVALUATED_AT,
    );
    assert.deepEqual(decision, {
      kind: "deny",
      requestId: "request-1",
      reason: "authentication_missing",
    });
  });

  it("denies when authentication evidence is unverified", () => {
    const decision = evaluateInboundSecurity(
      input({ evidence: evidence({ verified: false }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "authentication_invalid");
  });

  it("denies when authentication evidence is expired at the explicitly supplied evaluation time", () => {
    const decision = evaluateInboundSecurity(
      input({ evidence: evidence({ expiresAt: "2026-07-26T11:30:00.000Z" }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "authentication_expired");
  });

  it("denies when authentication evidence is not yet valid", () => {
    const decision = evaluateInboundSecurity(
      input({ evidence: evidence({ validFrom: "2026-07-26T12:30:00.000Z" }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal(
      (decision as { reason: string }).reason,
      "authentication_not_yet_valid",
    );
  });

  it("returns indeterminate when the principal is absent despite valid evidence", () => {
    const decision = evaluateInboundSecurity(
      input({ principal: null }),
      EVALUATED_AT,
    );
    assert.deepEqual(decision, {
      kind: "indeterminate",
      requestId: "request-1",
      reason: "insufficient_evidence",
    });
  });

  it("denies on principal mismatch against the evidence subject", () => {
    const decision = evaluateInboundSecurity(
      input({ principal: principal({ principalId: "someone-else" }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "principal_mismatch");
  });

  it("denies on principal mismatch against the access request principal", () => {
    const decision = evaluateInboundSecurity(
      input({
        evidence: evidence({ subjectId: "principal-1" }),
        principal: principal({ principalId: "principal-1" }),
        accessRequest: accessRequest({ principalId: "principal-2" }),
      }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "principal_mismatch");
  });

  it("denies on tenant mismatch", () => {
    const decision = evaluateInboundSecurity(
      input({ accessRequest: accessRequest({ tenantId: "tenant-2" }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "tenant_mismatch");
  });

  it("denies when the operation is not allowed by policy", () => {
    const decision = evaluateInboundSecurity(
      input({ policy: policy({ allowedOperations: ["dry-run"] }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "operation_not_allowed");
  });

  it("denies when replay evidence is required but missing", () => {
    const decision = evaluateInboundSecurity(
      input({ replayEvidence: null }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal(
      (decision as { reason: string }).reason,
      "replay_evidence_missing",
    );
  });

  it("denies when replay evidence marks the request as replayed", () => {
    const decision = evaluateInboundSecurity(
      input({ replayEvidence: replayEvidence({ replayed: true }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "replay_rejected");
  });

  it("denies when replay evidence does not identify the same request/evidence", () => {
    const decision = evaluateInboundSecurity(
      input({ replayEvidence: replayEvidence({ requestId: "other-request" }) }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "deny");
    assert.equal((decision as { reason: string }).reason, "replay_rejected");
  });

  it("allows once every explicit check passes", () => {
    const decision = evaluateInboundSecurity(input(), EVALUATED_AT);
    assert.deepEqual(decision, {
      kind: "allow",
      requestId: "request-1",
      principalId: "principal-1",
    });
  });

  it("skips the replay check when policy does not require it", () => {
    const decision = evaluateInboundSecurity(
      input({
        replayEvidence: null,
        policy: policy({ replayCheckRequired: false }),
      }),
      EVALUATED_AT,
    );
    assert.equal(decision.kind, "allow");
  });

  it("is deterministic across repeated evaluation of the same input", () => {
    const first = evaluateInboundSecurity(input(), EVALUATED_AT);
    const second = evaluateInboundSecurity(input(), EVALUATED_AT);
    assert.deepEqual(first, second);
  });

  it("returns an immutable, frozen decision", () => {
    const decision = evaluateInboundSecurity(input(), EVALUATED_AT);
    assert.equal(Object.isFrozen(decision), true);
  });

  it("never exposes secret-bearing fields on the decision", () => {
    const decision = evaluateInboundSecurity(input(), EVALUATED_AT);
    const serialized = JSON.stringify(decision);

    for (const forbidden of [
      "credentialFingerprint",
      "token",
      "password",
      "secret",
      "cookie",
      "apiKey",
    ]) {
      assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
    }
  });

  it("does not read the clock, randomness, filesystem, network, or process", () => {
    const source = readFileSync(
      new URL("../../src/inbound-security/evaluation.ts", import.meta.url),
      "utf8",
    );

    for (const forbidden of [
      "Date.now",
      "new Date()",
      "Math.random",
      "readFileSync",
      "fetch(",
      "child_process",
      "process.env",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundSecurityAndPrepareLoopRuntimeRequest,
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";
import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationEvidence,
  InboundPrincipal,
  InboundReplayEvidence,
  InboundSecurityEvaluationInput,
} from "../../src/inbound-security/types.js";

const EVALUATED_AT = "2026-07-26T12:00:00.000Z";

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    cycleId: "cycle-1",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "medium",
    budget: {
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
    ...overrides,
  };
}

function assembly(
  overrides: Partial<LoopRuntimeAuthorizedEngineAssembly> = {},
): LoopRuntimeAuthorizedEngineAssembly {
  return {
    catalog: {
      policies: [
        {
          ref: "policy.ref",
          value: { policyRef: "policy.ref", policyId: "policy-id" },
        },
      ],
      profiles: [
        {
          ref: "profile.ref",
          value: {
            profileRef: "profile.ref",
            profileId: "profile-id",
            maxEffort: "medium",
          },
        },
      ],
    },
    limits: {
      maxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      },
    },
    binding: {
      runtimeId: "local-process",
      executable: "node",
      arguments: ["--version"],
    },
    ...overrides,
  };
}

function counters() {
  return { authorizer: 0, assembler: 0 };
}

function authorizer(
  decision: unknown = { authorized: true },
  calls = counters(),
): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize() {
      calls.authorizer += 1;
      return decision as never;
    },
  };
}

function assemblerStub(
  result: unknown = { assembled: true, assembly: assembly() },
  calls = counters(),
) {
  return {
    assemble() {
      calls.assembler += 1;
      return result as never;
    },
  };
}

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

function security(
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

describe("evaluateInboundSecurityAndPrepareLoopRuntimeRequest", () => {
  it("denies without invoking the downstream authorizer or assembler when evidence is missing", async () => {
    const calls = counters();
    const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
      security: security({ evidence: null }),
      evaluatedAt: EVALUATED_AT,
      payload: payload(),
      authorizer: authorizer({ authorized: true }, calls),
      assembler: assemblerStub({ assembled: true, assembly: assembly() }, calls),
    });

    assert.equal(result.allowed, false);
    assert.equal((result as { decision: { kind: string } }).decision.kind, "deny");
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });

  it("denies without invoking downstream preparation for every non-allow decision path", async () => {
    const cases: Partial<InboundSecurityEvaluationInput>[] = [
      { evidence: evidence({ verified: false }) },
      { principal: null },
      { principal: principal({ principalId: "someone-else" }) },
      { accessRequest: accessRequest({ tenantId: "tenant-2" }) },
      { policy: policy({ allowedOperations: ["dry-run"] }) },
      { replayEvidence: null },
      { replayEvidence: replayEvidence({ replayed: true }) },
    ];

    for (const overrides of cases) {
      const calls = counters();
      const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
        security: security(overrides),
        evaluatedAt: EVALUATED_AT,
        payload: payload(),
        authorizer: authorizer({ authorized: true }, calls),
        assembler: assemblerStub(
          { assembled: true, assembly: assembly() },
          calls,
        ),
      });

      assert.equal(result.allowed, false);
      assert.equal(calls.authorizer, 0);
      assert.equal(calls.assembler, 0);
    }
  });

  it("invokes the downstream composed facade exactly once on an explicit allow", async () => {
    const calls = counters();
    const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
      security: security(),
      evaluatedAt: EVALUATED_AT,
      payload: payload(),
      authorizer: authorizer({ authorized: true }, calls),
      assembler: assemblerStub({ assembled: true, assembly: assembly() }, calls),
    });

    assert.equal(result.allowed, true);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    if (result.allowed) {
      assert.equal(result.decision.kind, "allow");
      assert.equal(result.prepared.prepared, true);
    }
  });

  it("supports an async downstream authorizer/assembler on the allow path", async () => {
    const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
      security: security(),
      evaluatedAt: EVALUATED_AT,
      payload: payload(),
      authorizer: {
        async authorize() {
          return { authorized: true };
        },
      },
      assembler: {
        async assemble() {
          return { assembled: true, assembly: assembly() };
        },
      },
    });

    assert.equal(result.allowed, true);
  });

  it("keeps a downstream preparation failure redacted without weakening the inbound decision", async () => {
    const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
      security: security(),
      evaluatedAt: EVALUATED_AT,
      payload: payload({ mode: "dry-run" }),
      authorizer: authorizer({ authorized: true }),
      assembler: assemblerStub({ assembled: true, assembly: assembly() }),
    });

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(result.decision.kind, "allow");
      assert.equal(result.prepared.prepared, false);
      const serialized = JSON.stringify(result);
      for (const forbidden of [
        "credentialFingerprint",
        "evidenceId",
        "token",
        "password",
        "secret",
      ]) {
        assert.equal(
          serialized.toLowerCase().includes(forbidden.toLowerCase()),
          false,
        );
      }
    }
  });

  it("propagates the indeterminate decision without invoking downstream preparation", async () => {
    const calls = counters();
    const result = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
      security: security({ principal: null }),
      evaluatedAt: EVALUATED_AT,
      payload: payload(),
      authorizer: authorizer({ authorized: true }, calls),
      assembler: assemblerStub(
        { assembled: true, assembly: assembly() },
        calls,
      ),
    });

    assert.equal(result.allowed, false);
    assert.equal((result as { decision: { kind: string } }).decision.kind, "indeterminate");
    assert.equal(calls.authorizer, 0);
    assert.equal(calls.assembler, 0);
  });
});

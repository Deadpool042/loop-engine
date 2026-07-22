import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildTransportRequest,
  createApprovalProvenance,
  normalizeApprovalProvenance,
  reviewTransportRequest,
  summarizeApprovalProvenance,
  validateApprovalProvenance,
} from "../../src/core/index.js";
import {
  OpenClawAuthorizationConfiguration,
  type AuthorizationConfiguration,
} from "../../src/authorization/index.js";
import {
  OpenClawApprovalProvenanceFixture,
  type ApprovalProvenance,
} from "../../src/provenance/index.js";
import type { ProviderExecutionPlan } from "../../src/providers/index.js";
import type { ReviewedTransportRequest } from "../../src/review/index.js";

function providerPlan(
  overrides: Partial<ProviderExecutionPlan> = {},
): ProviderExecutionPlan {
  return Object.freeze({
    providerId: "openclaw",
    provider: "local",
    runtimeId: "openclaw",
    status: "not_implemented",
    transport: "not_configured",
    requiredPermissions: Object.freeze(["read_only"]),
    diagnostics: Object.freeze([]),
    metadata: Object.freeze({ requestId: "approval-fixture" }),
    error: Object.freeze({
      code: "provider_not_implemented",
      message: "Fixture plan is inert.",
      details: Object.freeze({}),
      executionStarted: false,
    }),
    ...overrides,
  });
}

function approvedConfiguration(
  overrides: Partial<AuthorizationConfiguration> = {},
): AuthorizationConfiguration {
  return Object.freeze({
    ...OpenClawAuthorizationConfiguration,
    reviewMetadata: Object.freeze({
      configurationVersion: "approval-config/v1",
    }),
    requirement: Object.freeze({
      ...OpenClawAuthorizationConfiguration.requirement,
      approvedTransportCapabilities: Object.freeze(["shell_exec"]),
    }),
    active: true,
    approved: true,
    reviewRequired: false,
    configured: true,
    ...overrides,
  });
}

function reviewedFixture(): readonly [
  ReviewedTransportRequest,
  AuthorizationConfiguration,
] {
  const authorization = approvedConfiguration();
  const build = buildTransportRequest(providerPlan(), authorization);
  assert.ok(build.request);
  const review = reviewTransportRequest(build.request, authorization);
  assert.ok(review.request);
  return [review.request, authorization] as const;
}

describe("approval provenance contracts", () => {
  it("creates immutable evidence-only approval provenance", () => {
    const [reviewed, authorization] = reviewedFixture();
    const result = createApprovalProvenance(reviewed, authorization);
    assert.equal(result.status, "reviewPending");
    assert.equal(result.executionStarted, false);
    assert.equal(result.validation.valid, true);
    assert.equal(Object.isFrozen(result.provenance), true);
    assert.equal(Object.isFrozen(result.provenance.scope), true);
    assert.equal(Object.isFrozen(result.provenance.evidence), true);
    assert.equal(Object.isFrozen(result.provenance.versions), true);
    assert.equal(
      result.provenance.id,
      "approval-provenance.execution-review.approval-fixture",
    );
    assert.equal(
      result.provenance.reviewIdentifier,
      "execution-review.approval-fixture",
    );
    assert.equal(result.provenance.reviewTimestamp, "review-pending");
    assert.equal(result.provenance.scope.reviewedRequestId, "approval-fixture");
    assert.equal(
      result.provenance.scope.configurationId,
      "openclaw-plan-review",
    );
    assert.equal(result.provenance.evidence.approved, false);
    assert.equal(result.provenance.approved, false);
    assert.equal(result.provenance.versions.policyVersion, "default-deny/v1");
    assert.equal(
      result.provenance.versions.configurationVersion,
      "approval-config/v1",
    );
    assert.equal(
      result.provenance.versions.architectureRfcVersion,
      "rfc-execution-architecture-v11",
    );
    assert.doesNotMatch(
      JSON.stringify(result.provenance),
      /command|args|argv|binary|workingDirectory|stdin|stdout|stderr|timeout|environment|credential|dispatch/i,
    );
  });

  it("validates, normalizes, and summarizes deterministically", () => {
    const [reviewed, authorization] = reviewedFixture();
    const result = createApprovalProvenance(reviewed, authorization);
    const validation = validateApprovalProvenance(
      result.provenance,
      reviewed,
      authorization,
    );
    const summary = summarizeApprovalProvenance(
      result.provenance,
      reviewed,
      authorization,
    );
    const normalized = normalizeApprovalProvenance(result);
    assert.equal(validation.valid, true);
    assert.deepEqual(summary, result.summary);
    assert.equal(normalized, result);
    assert.deepEqual(createApprovalProvenance(reviewed, authorization), result);
  });

  it("keeps approval provenance pending and not approved by default", () => {
    const [reviewed, authorization] = reviewedFixture();
    const result = createApprovalProvenance(reviewed, authorization);
    assert.equal(result.provenance.status, "reviewPending");
    assert.equal(result.provenance.approved, false);
    assert.equal(result.provenance.evidence.approved, false);
    assert.equal(result.summary.reviewPending, true);
    assert.equal(result.summary.notApproved, true);
    assert.equal(result.summary.evidenceOnly, true);
  });

  it("rejects missing, pending, invalid, version, and reference mismatches", () => {
    const [reviewed, authorization] = reviewedFixture();
    const result = createApprovalProvenance(reviewed, authorization);
    const provenance = result.provenance;
    const cases = [
      validateApprovalProvenance(
        { ...provenance, id: "" } as ApprovalProvenance,
        reviewed,
        authorization,
      ),
      validateApprovalProvenance(
        { ...provenance, status: "notApproved" } as ApprovalProvenance,
        reviewed,
        authorization,
      ),
      validateApprovalProvenance(
        {
          ...provenance,
          evidence: { ...provenance.evidence, approvalId: "" },
        } as ApprovalProvenance,
        reviewed,
        authorization,
      ),
      validateApprovalProvenance(
        {
          ...provenance,
          versions: {
            ...provenance.versions,
            policyVersion: "wrong-policy",
          },
        } as ApprovalProvenance,
        reviewed,
        authorization,
      ),
      validateApprovalProvenance(
        {
          ...provenance,
          scope: { ...provenance.scope, reviewedRequestId: "other" },
        } as ApprovalProvenance,
        reviewed,
        authorization,
      ),
    ];
    assert.deepEqual(
      cases.map((validation) => validation.error?.code),
      [
        "approval_missing",
        "approval_pending",
        "approval_invalid",
        "approval_version_mismatch",
        "approval_reference_mismatch",
      ],
    );
    assert.ok(cases.every((validation) => validation.valid === false));
    assert.ok(
      cases.every((validation) => validation.error?.executionStarted === false),
    );
  });

  it("keeps the OpenClaw provenance fixture pending and reference-only", () => {
    assert.equal(OpenClawApprovalProvenanceFixture.status, "reviewPending");
    assert.equal(OpenClawApprovalProvenanceFixture.approved, false);
    assert.equal(OpenClawApprovalProvenanceFixture.evidence.approved, false);
    assert.equal(
      OpenClawApprovalProvenanceFixture.scope.configurationId,
      "openclaw-plan-review",
    );
    assert.equal(Object.isFrozen(OpenClawApprovalProvenanceFixture), true);
  });
});

describe("approval provenance architecture invariants", () => {
  const provenanceFiles = [
    "src/provenance/types.ts",
    "src/provenance/errors.ts",
    "src/provenance/validation.ts",
    "src/provenance/provenance.ts",
    "src/provenance/support.ts",
    "src/provenance/index.ts",
    "src/core/provenance.ts",
  ];

  for (const file of provenanceFiles) {
    it(`${file} has no execution, Runtime, or Transport coupling`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|node:(http|https|net|tls|fs)|process\.env/,
      );
      assert.doesNotMatch(
        source,
        /\bcommand\s*:|\bargs\s*:|\bargv\s*:|\bbinary(Path)?\s*:|workingDirectory|stdin\s*:|stdout\s*:|stderr\s*:|timeoutMs|environment\s*:|credentials?\s*:/,
      );
      assert.doesNotMatch(
        source,
        /TransportAdapterRequest|RuntimeRequest|ProviderAdapter|RuntimeAdapter|TransportAdapter|LocalProcessRuntime|executeTransport|selectTransport|resolveTransport\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/(runtime|transports|providers)\/(local-process|registry|selector|openclaw|claude-code|codex)/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(cli|commands|loop)\//);
    });
  }
});

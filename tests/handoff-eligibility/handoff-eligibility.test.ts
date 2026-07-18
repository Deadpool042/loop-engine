import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildTransportRequest,
  createApprovalProvenance,
  evaluateHandoffEligibility,
  normalizeHandoffEligibility,
  reviewTransportRequest,
  summarizeHandoffEligibility,
  validateHandoffEligibility,
} from "../../src/core/index.js";
import {
  OpenClawAuthorizationConfiguration,
  type AuthorizationConfiguration,
} from "../../src/authorization/index.js";
import {
  OpenClawHandoffEligibilityFixture,
  HANDOFF_ELIGIBILITY_REQUIREMENT_IDS,
  type HandoffEligibilityRequirementId,
} from "../../src/handoff-eligibility/index.js";
import type {
  ApprovalProvenance,
  ApprovalVersionSet,
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
    metadata: Object.freeze({ requestId: "handoff-fixture" }),
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
      configurationVersion: "handoff-config/v1",
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
  ApprovalProvenance,
] {
  const authorization = approvedConfiguration();
  const build = buildTransportRequest(providerPlan(), authorization);
  assert.ok(build.request);
  const review = reviewTransportRequest(build.request, authorization);
  assert.ok(review.request);
  const approval = createApprovalProvenance(review.request, authorization);
  return [review.request, approval.provenance] as const;
}

function forceApproved(
  reviewed: ReviewedTransportRequest,
  provenance: ApprovalProvenance,
): readonly [ReviewedTransportRequest, ApprovalProvenance] {
  return [
    {
      ...reviewed,
      approved: true,
      handoffAllowed: true,
      status: "not_approved",
    } as unknown as ReviewedTransportRequest,
    {
      ...provenance,
      approved: true,
      status: "reviewPending",
      evidence: { ...provenance.evidence, approved: true },
    } as unknown as ApprovalProvenance,
  ];
}

function withVersion(
  provenance: ApprovalProvenance,
  key: keyof ApprovalVersionSet,
  value: string,
): ApprovalProvenance {
  return {
    ...provenance,
    versions: { ...provenance.versions, [key]: value },
  } as ApprovalProvenance;
}

describe("handoff eligibility contracts", () => {
  it("keeps missing evidence pending, denied, and non-executing", () => {
    const result = evaluateHandoffEligibility(null, null);
    assert.equal(result.status, "pending");
    assert.equal(result.decision, "not_eligible");
    assert.equal(result.handoffAllowed, false);
    assert.equal(result.dispatchable, false);
    assert.equal(result.executable, false);
    assert.equal(result.executionStarted, false);
    assert.equal(result.error?.code, "handoff_review_missing");
    assert.deepEqual(
      result.eligibility.requirements.map((item) => item.id),
      [...HANDOFF_ELIGIBILITY_REQUIREMENT_IDS],
    );
  });

  it("evaluates structurally consistent current evidence conservatively as not eligible", () => {
    const [reviewed, provenance] = reviewedFixture();
    const result = evaluateHandoffEligibility(reviewed, provenance);
    assert.equal(result.status, "invalid");
    assert.equal(result.decision, "not_eligible");
    assert.equal(result.error?.code, "handoff_review_not_approved");
    assert.equal(result.summary.reviewPresent, true);
    assert.equal(result.summary.provenancePresent, true);
    assert.equal(result.summary.approvalExplicit, false);
    assert.equal(result.summary.defaultDenied, true);
    assert.equal(result.handoffAllowed, false);
  });

  it("can report eligible only for explicitly represented approved evidence", () => {
    const [reviewed, provenance] = reviewedFixture();
    const [approvedReview, approvedProvenance] = forceApproved(
      reviewed,
      provenance,
    );
    const result = evaluateHandoffEligibility(
      approvedReview,
      approvedProvenance,
    );
    assert.equal(result.status, "evaluated");
    assert.equal(result.decision, "eligible");
    assert.equal(result.eligibility.handoffAllowed, false);
    assert.equal(result.eligibility.dispatchable, false);
    assert.equal(result.eligibility.executable, false);
    assert.equal(result.executionStarted, false);
  });

  it("uses indeterminate requirements for incomplete evidence", () => {
    const [reviewed] = reviewedFixture();
    const result = evaluateHandoffEligibility(reviewed, null);
    assert.equal(result.decision, "indeterminate");
    assert.equal(result.error?.code, "handoff_provenance_missing");
    assert.ok(
      result.eligibility.requirements.some(
        (item) => item.outcome === "unknown",
      ),
    );
  });

  it("validates missing and mismatched evidence with stable errors", () => {
    const [reviewed, provenance] = reviewedFixture();
    const [approvedReview, approvedProvenance] = forceApproved(
      reviewed,
      provenance,
    );
    const cases = [
      validateHandoffEligibility(null, provenance),
      validateHandoffEligibility(reviewed, null),
      validateHandoffEligibility(
        { ...approvedReview, reviewId: "" } as ReviewedTransportRequest,
        approvedProvenance,
      ),
      validateHandoffEligibility(approvedReview, {
        ...approvedProvenance,
        id: "",
      } as ApprovalProvenance),
      validateHandoffEligibility(reviewed, approvedProvenance),
      validateHandoffEligibility(approvedReview, provenance),
      validateHandoffEligibility(approvedReview, {
        ...approvedProvenance,
        scope: { ...approvedProvenance.scope, reviewedRequestId: "other" },
      } as ApprovalProvenance),
      validateHandoffEligibility(approvedReview, {
        ...approvedProvenance,
        reviewIdentifier: "other-review",
      } as ApprovalProvenance),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "policyVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "configurationVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "mappingVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "protocolVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "runtimeContractVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "transportContractVersion", ""),
      ),
      validateHandoffEligibility(
        approvedReview,
        withVersion(approvedProvenance, "architectureRfcVersion", "wrong-rfc"),
      ),
      validateHandoffEligibility(
        {
          ...approvedReview,
          executable: true,
        } as unknown as ReviewedTransportRequest,
        approvedProvenance,
      ),
      validateHandoffEligibility(
        {
          ...approvedReview,
          dispatchable: true,
        } as unknown as ReviewedTransportRequest,
        approvedProvenance,
      ),
      validateHandoffEligibility(
        {
          ...approvedReview,
          metadata: { adapterPayload: "forbidden" },
        } as unknown as ReviewedTransportRequest,
        approvedProvenance,
      ),
    ];
    assert.deepEqual(
      cases.map((validation) => validation.error?.code),
      [
        "handoff_review_missing",
        "handoff_provenance_missing",
        "handoff_review_invalid",
        "handoff_provenance_invalid",
        "handoff_review_not_approved",
        "handoff_provenance_not_approved",
        "handoff_scope_mismatch",
        "handoff_reference_mismatch",
        "handoff_policy_version_mismatch",
        "handoff_configuration_version_mismatch",
        "handoff_mapping_version_mismatch",
        "handoff_protocol_version_mismatch",
        "handoff_runtime_version_mismatch",
        "handoff_transport_version_mismatch",
        "handoff_architecture_version_mismatch",
        "handoff_executable_state_forbidden",
        "handoff_dispatchable_state_forbidden",
        "handoff_adapter_request_forbidden",
      ],
    );
    assert.ok(
      cases.every((validation) => validation.error?.executionStarted === false),
    );
  });

  it("normalizes, summarizes, and orders requirements deterministically", () => {
    const [reviewed, provenance] = reviewedFixture();
    const result = evaluateHandoffEligibility(reviewed, provenance);
    const normalized = normalizeHandoffEligibility(result);
    const summary = summarizeHandoffEligibility(result);
    assert.deepEqual(summary, result.summary);
    assert.deepEqual(
      normalized.eligibility.requirements.map((item) => item.id),
      [...HANDOFF_ELIGIBILITY_REQUIREMENT_IDS],
    );
    assert.deepEqual(evaluateHandoffEligibility(reviewed, provenance), result);
  });

  it("freezes output and keeps the OpenClaw fixture denied", () => {
    const [reviewed, provenance] = reviewedFixture();
    const result = evaluateHandoffEligibility(reviewed, provenance);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.eligibility), true);
    assert.equal(Object.isFrozen(result.eligibility.evidence), true);
    assert.equal(Object.isFrozen(result.eligibility.requirements), true);
    assert.equal(OpenClawHandoffEligibilityFixture.decision, "not_eligible");
    assert.equal(OpenClawHandoffEligibilityFixture.handoffAllowed, false);
    assert.equal(OpenClawHandoffEligibilityFixture.dispatchable, false);
    assert.equal(OpenClawHandoffEligibilityFixture.executable, false);
    assert.equal(OpenClawHandoffEligibilityFixture.executionStarted, false);
    assert.doesNotMatch(
      JSON.stringify(OpenClawHandoffEligibilityFixture),
      /command|args|argv|binary|workingDirectory|stdin|stdout|stderr|timeout|environment|credential|TransportAdapterRequest|RuntimeRequest/i,
    );
  });
});

describe("handoff eligibility architecture invariants", () => {
  const files = [
    "src/handoff-eligibility/types.ts",
    "src/handoff-eligibility/errors.ts",
    "src/handoff-eligibility/validation.ts",
    "src/handoff-eligibility/evaluation.ts",
    "src/handoff-eligibility/support.ts",
    "src/handoff-eligibility/index.ts",
    "src/core/handoff-eligibility.ts",
  ];

  it("exposes a unique evaluator function", () => {
    const source = readFileSync(
      "src/handoff-eligibility/evaluation.ts",
      "utf8",
    );
    assert.match(source, /export const evaluateHandoffEligibility/);
    assert.doesNotMatch(source, /\bclass\s+/);
  });

  for (const file of files) {
    it(`${file} has no execution, adapter, Runtime, Transport, process, filesystem, or network coupling`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /child_process|node:child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
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

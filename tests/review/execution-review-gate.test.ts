import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildTransportRequest,
  normalizeTransportReview,
  reviewTransportRequest,
  summarizeTransportReview,
  validateTransportReview,
} from "../../src/core/index.js";
import {
  OpenClawAuthorizationConfiguration,
  type AuthorizationConfiguration,
} from "../../src/authorization/index.js";
import type { ProviderExecutionPlan } from "../../src/providers/index.js";
import { OpenClawReviewedTransportRequestFixture } from "../../src/review/index.js";
import type { TransportRequest } from "../../src/transport-request/index.js";

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
    metadata: Object.freeze({ requestId: "review-fixture" }),
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
  TransportRequest,
  AuthorizationConfiguration,
] {
  const authorization = approvedConfiguration();
  const build = buildTransportRequest(providerPlan(), authorization);
  assert.ok(build.request);
  return [build.request, authorization] as const;
}

describe("execution review gate", () => {
  it("reviews a TransportRequest into immutable non-executable evidence", () => {
    const [request, authorization] = reviewedFixture();
    const result = reviewTransportRequest(request, authorization);
    assert.equal(result.status, "reviewed");
    assert.equal(result.executionStarted, false);
    assert.equal(result.validation.valid, true);
    assert.ok(result.request);
    assert.equal(Object.isFrozen(result.review), true);
    assert.equal(Object.isFrozen(result.request), true);
    assert.equal(Object.isFrozen(result.request.sourceRequest), true);
    assert.equal(Object.isFrozen(result.request.capabilityIds), true);
    assert.equal(result.review.id, "execution-review.review-fixture");
    assert.equal(result.request.reviewId, "execution-review.review-fixture");
    assert.equal(result.request.providerId, "openclaw");
    assert.equal(result.request.mappingId, "openclaw-planning");
    assert.equal(result.request.intentId, "openclaw-plan");
    assert.equal(result.request.runtimeId, "openclaw");
    assert.equal(result.request.transportId, "local-process");
    assert.deepEqual(result.request.capabilityIds, ["shell_exec"]);
    assert.equal(result.request.status, "not_approved");
    assert.equal(result.request.approved, false);
    assert.equal(result.request.dispatchable, false);
    assert.equal(result.request.executable, false);
    assert.equal(result.request.handoffAllowed, false);
    assert.doesNotMatch(
      JSON.stringify(result.request),
      /command|args|argv|binary|workingDirectory|stdin|stdout|stderr|timeout|environment|credential/i,
    );
  });

  it("normalizes and summarizes review output deterministically", () => {
    const [request, authorization] = reviewedFixture();
    const result = reviewTransportRequest(request, authorization);
    const normalized = normalizeTransportReview(result);
    const summary = summarizeTransportReview(result);
    assert.equal(normalized, result);
    assert.deepEqual(summary, result.summary);
    assert.deepEqual(reviewTransportRequest(request, authorization), result);
  });

  it("rejects missing, required, incomplete, unapproved, version, configuration, and policy failures", () => {
    const [request, authorization] = reviewedFixture();
    const cases = [
      reviewTransportRequest(
        { ...request, id: "" } as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        {
          ...request,
          authorization: {
            ...request.authorization,
            reviewRequired: true,
          },
        } as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        { ...request, capabilities: [] } as unknown as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        {
          ...request,
          authorization: {
            ...request.authorization,
            authorized: false,
          },
        } as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        {
          ...request,
          metadata: { protocolVersion: "wrong-version" },
        } as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        {
          ...request,
          mapping: { mappingId: "openclaw-other" },
        } as TransportRequest,
        authorization,
      ),
      reviewTransportRequest(
        {
          ...request,
          policy: {
            ...request.policy,
            configurationId: "openclaw-other",
          },
        } as TransportRequest,
        authorization,
      ),
    ];
    assert.deepEqual(
      cases.map((result) => result.error?.code),
      [
        "review_missing",
        "review_required",
        "review_incomplete",
        "review_not_approved",
        "review_version_mismatch",
        "review_configuration_mismatch",
        "review_policy_mismatch",
      ],
    );
    assert.ok(cases.every((result) => result.executionStarted === false));
    assert.ok(cases.every((result) => result.request === null));
  });

  it("exposes validation separately without producing a ReviewedTransportRequest", () => {
    const [request, authorization] = reviewedFixture();
    const validation = validateTransportReview(request, authorization);
    assert.equal(validation.valid, true);
    assert.equal(validation.diagnostics.length, 0);
  });

  it("keeps the OpenClaw reviewed fixture denied by default", () => {
    assert.equal(
      OpenClawReviewedTransportRequestFixture.providerId,
      "openclaw",
    );
    assert.equal(OpenClawReviewedTransportRequestFixture.approved, false);
    assert.equal(OpenClawReviewedTransportRequestFixture.dispatchable, false);
    assert.equal(OpenClawReviewedTransportRequestFixture.executable, false);
    assert.equal(OpenClawReviewedTransportRequestFixture.handoffAllowed, false);
    assert.equal(
      Object.isFrozen(OpenClawReviewedTransportRequestFixture),
      true,
    );
  });
});

describe("execution review gate architecture invariants", () => {
  const reviewFiles = [
    "src/review/types.ts",
    "src/review/errors.ts",
    "src/review/validation.ts",
    "src/review/review.ts",
    "src/review/support.ts",
    "src/review/index.ts",
    "src/core/review.ts",
  ];

  for (const file of reviewFiles) {
    it(`${file} has no execution, Provider, Runtime, or Transport coupling`, () => {
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

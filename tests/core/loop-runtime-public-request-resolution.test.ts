import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  resolveLoopRuntimePublicRequestReferences,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestReferenceCatalog,
  type LoopRuntimePublicRequestResolution,
} from "../../src/core/index.js";

function buildRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "fixture-project",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "low",
    budget: {
      maxTokens: 0,
      maxCostUsd: 0,
      maxDurationMs: 0,
      maxCalls: 0,
      maxRepairs: 0,
    },
    ...overrides,
  };
}

function frozenRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  const request = buildRequest(overrides);
  Object.freeze(request.budget);
  return Object.freeze(request);
}

describe("resolveLoopRuntimePublicRequestReferences", () => {
  it("resolves both references with exact identity", () => {
    const policy = Object.freeze({ id: "policy-sentinel", nested: { level: 1 } });
    const profile = Object.freeze({ id: "profile-sentinel", nested: { level: 2 } });
    const request = frozenRequest({
      policyRef: "policy.ref",
      profileRef: "profile.ref",
    });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<
      typeof policy,
      typeof profile
    > = {
      policies: [{ ref: "policy.ref", value: policy }],
      profiles: [{ ref: "profile.ref", value: profile }],
    };

    const resolution = resolveLoopRuntimePublicRequestReferences(
      request,
      catalog,
    );

    assert.equal(resolution.resolved, true);
    assert.equal(resolution.request, request);
    assert.equal(resolution.policy, policy);
    assert.equal(resolution.profile, profile);
    assert.equal(Object.isFrozen(resolution), true);
  });

  it("fails closed for invalid requests", () => {
    const request = frozenRequest({ project: "" });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<{}, {}> = {
      policies: [],
      profiles: [],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "invalid_request",
      },
    );
  });

  it("fails closed for unknown policy references", () => {
    const request = frozenRequest({ policyRef: "missing.policy" });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<{}, {}> = {
      policies: [{ ref: "policy.ref", value: {} }],
      profiles: [{ ref: "profile.ref", value: {} }],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "unknown_policy_ref",
      },
    );
  });

  it("fails closed for ambiguous policy references", () => {
    const request = frozenRequest({ policyRef: "policy.ref" });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<{ tag: string }, {}> =
      {
        policies: [
          { ref: "policy.ref", value: { tag: "first" } },
          { ref: "policy.ref", value: { tag: "second" } },
        ],
        profiles: [{ ref: "profile.ref", value: {} }],
      };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "ambiguous_policy_ref",
      },
    );
  });

  it("fails closed for unknown profile references", () => {
    const request = frozenRequest({ profileRef: "missing.profile" });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<{}, {}> = {
      policies: [{ ref: "policy.ref", value: {} }],
      profiles: [{ ref: "profile.ref", value: {} }],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "unknown_profile_ref",
      },
    );
  });

  it("fails closed for ambiguous profile references", () => {
    const request = frozenRequest({ profileRef: "profile.ref" });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<{}, { tag: string }> =
      {
        policies: [{ ref: "policy.ref", value: {} }],
        profiles: [
          { ref: "profile.ref", value: { tag: "first" } },
          { ref: "profile.ref", value: { tag: "second" } },
        ],
      };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "ambiguous_profile_ref",
      },
    );
  });

  it("matches references exactly and is case-sensitive", () => {
    const policy = Object.freeze({ token: "policy" });
    const profile = Object.freeze({ token: "profile" });
    const request = frozenRequest({
      policyRef: "Policy.Ref",
      profileRef: "Profile.Ref",
    });
    const catalog: LoopRuntimePublicRequestReferenceCatalog<
      typeof policy,
      typeof profile
    > = {
      policies: [{ ref: "policy.ref", value: policy }],
      profiles: [{ ref: "profile.ref", value: profile }],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "unknown_policy_ref",
      },
    );
  });

  it("does not fall back to the first matching entry on duplicates", () => {
    const request = frozenRequest();
    const catalog: LoopRuntimePublicRequestReferenceCatalog<
      { id: string },
      { id: string }
    > = {
      policies: [
        { ref: "policy.ref", value: { id: "first-policy" } },
        { ref: "policy.ref", value: { id: "second-policy" } },
      ],
      profiles: [
        { ref: "profile.ref", value: { id: "first-profile" } },
        { ref: "profile.ref", value: { id: "second-profile" } },
      ],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "ambiguous_policy_ref",
      },
    );
  });

  it("returns internal values and request by identity without mutating them", () => {
    const policy = { sentinel: "policy" };
    const profile = { sentinel: "profile" };
    const request = frozenRequest();
    const requestSnapshot = JSON.parse(JSON.stringify(request)) as LoopRuntimePublicRequest;
    const catalog: LoopRuntimePublicRequestReferenceCatalog<typeof policy, typeof profile> =
      {
        policies: [{ ref: "policy.ref", value: policy }],
        profiles: [{ ref: "profile.ref", value: profile }],
      };

    const resolution = resolveLoopRuntimePublicRequestReferences(request, catalog);

    assert.equal(resolution.resolved, true);
    assert.equal(resolution.request, request);
    assert.equal(resolution.policy, policy);
    assert.equal(resolution.profile, profile);
    assert.deepEqual(request, requestSnapshot);
    assert.deepEqual(policy, { sentinel: "policy" });
    assert.deepEqual(profile, { sentinel: "profile" });
  });

  it("accepts frozen inputs and remains deterministic", () => {
    const policy = Object.freeze({ sentinel: "policy" });
    const profile = Object.freeze({ sentinel: "profile" });
    const request = frozenRequest();
    const catalog: LoopRuntimePublicRequestReferenceCatalog<typeof policy, typeof profile> =
      Object.freeze({
        policies: Object.freeze([{ ref: "policy.ref", value: policy }]),
        profiles: Object.freeze([{ ref: "profile.ref", value: profile }]),
      });

    const first = resolveLoopRuntimePublicRequestReferences(request, catalog);
    const second = resolveLoopRuntimePublicRequestReferences(request, catalog);

    assert.equal(Object.isFrozen(first), true);
    assert.deepEqual(first, second);
  });

  it("handles an empty catalog fail-closed", () => {
    const request = frozenRequest();
    const catalog: LoopRuntimePublicRequestReferenceCatalog<unknown, unknown> = {
      policies: [],
      profiles: [],
    };

    assert.deepEqual(
      resolveLoopRuntimePublicRequestReferences(request, catalog),
      {
        resolved: false,
        reason: "unknown_policy_ref",
      },
    );
  });

  it("exports the public resolver contract from Core", () => {
    const request = frozenRequest();
    const policy = { sentinel: "policy" };
    const profile = { sentinel: "profile" };
    const catalog: LoopRuntimePublicRequestReferenceCatalog<typeof policy, typeof profile> =
      {
        policies: [{ ref: "policy.ref", value: policy }],
        profiles: [{ ref: "profile.ref", value: profile }],
      };
    const resolution: LoopRuntimePublicRequestResolution<typeof policy, typeof profile> =
      resolveLoopRuntimePublicRequestReferences(request, catalog);

    assert.equal(resolution.resolved, true);
  });
});

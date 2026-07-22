import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  applyLoopRuntimeInternalLimits,
  createLoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimeInternalLimits,
  type LoopRuntimeLimitedRequestConfiguration,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestResolution,
  type LoopRuntimeRequestLimitResult,
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
  type LoopRuntimeResolvedRequestConfiguration,
} from "../../src/core/index.js";
import { AGENT_EFFORTS } from "../../src/agents/types.js";

function buildRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "fixture-project",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "high",
    budget: {
      maxTokens: 12,
      maxCostUsd: 34,
      maxDurationMs: 56,
      maxCalls: 7,
      maxRepairs: 8,
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

function buildResolution(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimeResolvedRequestConfiguration {
  const request = frozenRequest(overrides);
  const resolution: LoopRuntimePublicRequestResolution<
    LoopRuntimeResolvedPolicyConfiguration,
    LoopRuntimeResolvedProfileConfiguration
  > = {
    resolved: true,
    request,
    policy: {
      policyRef: request.policyRef,
      policyId: "policy-id",
    },
    profile: {
      profileRef: request.profileRef,
      profileId: "profile-id",
      maxEffort: "max",
    },
  };
  const configured = createLoopRuntimeResolvedRequestConfiguration(resolution);

  if (!configured.configured) {
    throw new Error("expected a resolved configuration fixture");
  }

  return configured.configuration;
}

function freezeInternalLimits(
  limits: LoopRuntimeInternalLimits,
): LoopRuntimeInternalLimits {
  Object.freeze(limits.budget);
  return Object.freeze(limits);
}

describe("applyLoopRuntimeInternalLimits", () => {
  it("limits each budget dimension to the minimum of public and internal ceilings", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 12,
        maxCostUsd: 34,
        maxDurationMs: 56,
        maxCalls: 7,
        maxRepairs: 8,
      },
    });
    const limits = freezeInternalLimits({
      maxEffort: "xhigh",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const limited: LoopRuntimeRequestLimitResult = applyLoopRuntimeInternalLimits(
      configuration,
      limits,
    );

    assert.equal(limited.limited, true);
    if (limited.limited) {
      const limitedConfiguration: LoopRuntimeLimitedRequestConfiguration =
        limited.configuration;

      assert.equal(limitedConfiguration.request, configuration.request);
      assert.equal(limitedConfiguration.policy, configuration.policy);
      assert.equal(limitedConfiguration.profile, configuration.profile);
      assert.equal(limitedConfiguration.effectiveEffort, "high");
      assert.deepEqual(limitedConfiguration.effectiveBudget, {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 7,
        maxRepairs: 8,
      });
      assert.equal(Object.isFrozen(limited), true);
      assert.equal(Object.isFrozen(limited.configuration), true);
      assert.equal(Object.isFrozen(limited.configuration.effectiveBudget), true);
    }
  });

  it("limits to the lower public budget when the public side is stricter", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 1,
        maxCostUsd: 2,
        maxDurationMs: 3,
        maxCalls: 4,
        maxRepairs: 5,
      },
    });
    const limits = freezeInternalLimits({
      maxEffort: "max",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.deepEqual(limited.configuration.effectiveBudget, configuration.request.budget);
    }
  });

  it("keeps equal ceilings unchanged", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 5,
        maxCostUsd: 6,
        maxDurationMs: 7,
        maxCalls: 8,
        maxRepairs: 9,
      },
    });
    const limits = freezeInternalLimits({
      maxEffort: "high",
      budget: {
        maxTokens: 5,
        maxCostUsd: 6,
        maxDurationMs: 7,
        maxCalls: 8,
        maxRepairs: 9,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.deepEqual(limited, {
      limited: true,
      configuration: {
        request: configuration.request,
        policy: configuration.policy,
        profile: configuration.profile,
        effectiveEffort: "high",
        effectiveBudget: {
          maxTokens: 5,
          maxCostUsd: 6,
          maxDurationMs: 7,
          maxCalls: 8,
          maxRepairs: 9,
        },
      },
    });
  });

  it("applies the minimum across mixed public and internal budget dimensions", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 50,
        maxCostUsd: 1,
        maxDurationMs: 60,
        maxCalls: 2,
        maxRepairs: 70,
      },
    });
    const limits = freezeInternalLimits({
      maxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 1,
        maxRepairs: 80,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.deepEqual(limited.configuration.effectiveBudget, {
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 30,
        maxCalls: 1,
        maxRepairs: 70,
      });
    }
  });

  it("accepts zero-valued budgets", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      },
    });
    const limits = freezeInternalLimits({
      maxEffort: "low",
      budget: {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      },
    });

    assert.deepEqual(applyLoopRuntimeInternalLimits(configuration, limits), {
      limited: true,
      configuration: {
        request: configuration.request,
        policy: configuration.policy,
        profile: configuration.profile,
        effectiveEffort: "low",
        effectiveBudget: {
          maxTokens: 0,
          maxCostUsd: 0,
          maxDurationMs: 0,
          maxCalls: 0,
          maxRepairs: 0,
        },
      },
    });
  });

  it("limits effort to the public requested ceiling", () => {
    const configuration = buildResolution({
      requestedMaxEffort: "medium",
    });
    const limits = freezeInternalLimits({
      maxEffort: "max",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.equal(limited.configuration.effectiveEffort, "medium");
    }
  });

  it("limits effort to the profile ceiling when it is stricter", () => {
    const configuration = buildResolution({
      requestedMaxEffort: "max",
    });
    const limits = freezeInternalLimits({
      maxEffort: "max",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });
    const narrowedConfiguration = Object.freeze({
      ...configuration,
      profile: {
        ...configuration.profile,
        maxEffort: "medium" as const,
      },
    }) as LoopRuntimeResolvedRequestConfiguration;

    const limited = applyLoopRuntimeInternalLimits(
      narrowedConfiguration,
      limits,
    );

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.equal(limited.configuration.effectiveEffort, "medium");
    }
  });

  it("limits effort to the internal ceiling when it is stricter", () => {
    const configuration = buildResolution({
      requestedMaxEffort: "max",
    });
    const limits = freezeInternalLimits({
      maxEffort: "low",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.equal(limited.configuration.effectiveEffort, "low");
    }
  });

  it("fails closed for invalid internal limits", () => {
    const configuration = buildResolution();
    const invalidLimits = {
      maxEffort: "not-an-effort" as unknown as LoopRuntimeInternalLimits["maxEffort"],
      budget: {
        maxTokens: -1,
        maxCostUsd: Number.POSITIVE_INFINITY,
        maxDurationMs: Number.MAX_SAFE_INTEGER + 1,
        maxCalls: -2,
        maxRepairs: -3,
      },
    } as LoopRuntimeInternalLimits;

    assert.deepEqual(applyLoopRuntimeInternalLimits(configuration, invalidLimits), {
      limited: false,
      reason: "invalid_internal_limits",
    });
  });

  it("fails closed for invalid runtime effort order", () => {
    const configuration = buildResolution({
      requestedMaxEffort: "invalid-effort" as unknown as (typeof AGENT_EFFORTS)[number],
    }) as LoopRuntimeResolvedRequestConfiguration;
    const limits = freezeInternalLimits({
      maxEffort: "max",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    assert.deepEqual(applyLoopRuntimeInternalLimits(configuration, limits), {
      limited: false,
      reason: "unsupported_effort_order",
    });
  });

  it("reuses the canonical AgentEffort order", () => {
    const configuration = buildResolution({
      requestedMaxEffort: AGENT_EFFORTS[3],
    });
    const limits = freezeInternalLimits({
      maxEffort: AGENT_EFFORTS[2],
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const limited = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(limited.limited, true);
    if (limited.limited) {
      assert.equal(limited.configuration.effectiveEffort, AGENT_EFFORTS[2]);
    }
  });

  it("does not widen budget or effort and keeps inputs frozen and unchanged", () => {
    const configuration = buildResolution({
      budget: {
        maxTokens: 12,
        maxCostUsd: 34,
        maxDurationMs: 56,
        maxCalls: 7,
        maxRepairs: 8,
      },
    });
    const snapshot = JSON.parse(JSON.stringify(configuration)) as typeof configuration;
    const limits = freezeInternalLimits({
      maxEffort: "high",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    });

    const first = applyLoopRuntimeInternalLimits(configuration, limits);
    const second = applyLoopRuntimeInternalLimits(configuration, limits);

    assert.equal(first.limited, true);
    assert.equal(Object.isFrozen(first), true);
    if (first.limited) {
      assert.equal(Object.isFrozen(first.configuration), true);
      assert.equal(Object.isFrozen(first.configuration.effectiveBudget), true);
      assert.equal(first.configuration.request, configuration.request);
      assert.equal(first.configuration.policy, configuration.policy);
      assert.equal(first.configuration.profile, configuration.profile);
      assert.deepEqual(first.configuration.effectiveBudget, {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 7,
        maxRepairs: 8,
      });
      assert.equal(first.configuration.effectiveEffort, "high");
    }
    assert.deepEqual(first, second);
    assert.deepEqual(configuration, snapshot);
  });

  it("exports the internal runtime request limits contract from Core", () => {
    assert.equal(typeof applyLoopRuntimeInternalLimits, "function");
    const source = readFileSync(
      "src/core/loop-runtime-public-request-limits.ts",
      "utf8",
    );

    for (const forbidden of [
      "RuntimeResult",
      "RuntimeRequest",
      "RuntimeAdapter",
      "AgentSelectionRequest",
      "LocalProcessExecutionBinding",
      "LocalProcessExecutionPolicy",
      "PolicyBoundLocalProcessBridgeInput",
      "LoopRuntimeExecutionReceipt",
      "LoopRuntimeExecutionPlan",
    ]) {
      assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`));
    }
  });
});

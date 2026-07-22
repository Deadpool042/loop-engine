import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  applyLoopRuntimeInternalLimits,
  createLoopRuntimeExecutionPlan,
  createLoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimeExecutionPlan,
  type LoopRuntimeExecutionPlanFailureReason,
  type LoopRuntimeExecutionPlanResult,
  type LoopRuntimeInternalLimits,
  type LoopRuntimeLimitedRequestConfiguration,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestResolution,
  type LoopRuntimeResolvedProfileConfiguration,
  type LoopRuntimeResolvedPolicyConfiguration,
} from "../../src/core/index.js";

function buildRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "high",
    budget: {
      maxTokens: 10,
      maxCostUsd: 20,
      maxDurationMs: 30,
      maxCalls: 40,
      maxRepairs: 50,
    },
    ...overrides,
  };
}

function buildLimitedConfiguration(
  requestOverrides: Partial<LoopRuntimePublicRequest> = {},
  limitsOverrides: Partial<LoopRuntimeInternalLimits> = {},
): LoopRuntimeLimitedRequestConfiguration {
  const request = Object.freeze({
    ...buildRequest(requestOverrides),
    budget: Object.freeze({
      ...buildRequest().budget,
      ...requestOverrides.budget,
    }),
  });
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
      maxEffort: "medium",
    },
  };
  const configured = createLoopRuntimeResolvedRequestConfiguration(resolution);

  if (!configured.configured) {
    throw new Error("expected a resolved configuration fixture");
  }

  const limits: LoopRuntimeInternalLimits = Object.freeze({
    maxEffort: limitsOverrides.maxEffort ?? "max",
    budget: Object.freeze({
      maxTokens: 9,
      maxCostUsd: 19,
      maxDurationMs: 29,
      maxCalls: 39,
      maxRepairs: 49,
      ...(limitsOverrides.budget ?? {}),
    }),
  });
  const limited = applyLoopRuntimeInternalLimits(configured.configuration, limits);

  if (!limited.limited) {
    throw new Error("expected a limited configuration fixture");
  }

  return limited.configuration;
}

function assertPlanSurface(plan: LoopRuntimeExecutionPlan, hasCycleId: boolean): void {
  assert.deepEqual(
    Object.keys(plan),
    hasCycleId
      ? [
          "project",
          "mode",
          "policyId",
          "profileId",
          "effort",
          "cycleId",
          "budget",
        ]
      : ["project", "mode", "policyId", "profileId", "effort", "budget"],
  );
  assert.equal("policyRef" in plan, false);
  assert.equal("profileRef" in plan, false);
  assert.equal("requestedMaxEffort" in plan, false);
  assert.equal("request" in plan, false);
  assert.equal("policy" in plan, false);
  assert.equal("profile" in plan, false);
  assert.equal("AgentRegistry" in plan, false);
  assert.equal("AgentSelectionRequest" in plan, false);
  assert.equal("PolicyBoundLocalProcessBridgeInput" in plan, false);
  assert.equal("LocalProcessExecutionBinding" in plan, false);
  assert.equal("LocalProcessExecutionPolicy" in plan, false);
  assert.equal("RuntimeResult" in plan, false);
  assert.equal("runtimeCapabilities" in plan, false);
  assert.equal("runtimeMapping" in plan, false);
  assert.equal("loopRunResult" in plan, false);
  assert.equal("sender" in plan, false);
  assert.equal("destination" in plan, false);
  assert.equal("headers" in plan, false);
  assert.equal("environment" in plan, false);
  assert.equal("cwd" in plan, false);
  assert.equal("executable" in plan, false);
  assert.equal("provider" in plan, false);
  assert.equal("model" in plan, false);
  assert.equal("failureReason" in plan, false);
}

describe("createLoopRuntimeExecutionPlan", () => {
  it("creates a valid dry-run plan", () => {
    const configuration = buildLimitedConfiguration({
      mode: "dry-run",
    });

    const result: LoopRuntimeExecutionPlanResult =
      createLoopRuntimeExecutionPlan(configuration);

    assert.equal(result.planned, true);
    if (result.planned) {
      assert.deepEqual(result.plan, {
        project: "loop-engine",
        mode: "dry-run",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "medium",
        budget: {
          maxTokens: 9,
          maxCostUsd: 19,
          maxDurationMs: 29,
          maxCalls: 39,
          maxRepairs: 49,
        },
      });
      assert.equal(Object.isFrozen(result), true);
      assert.equal(Object.isFrozen(result.plan), true);
      assert.equal(Object.isFrozen(result.plan.budget), true);
      assertPlanSurface(result.plan, false);
    }
  });

  it("creates a valid execute plan and preserves an explicit cycle id", () => {
    const configuration = buildLimitedConfiguration({
      mode: "execute",
      cycleId: "cycle-123",
    });

    const result = createLoopRuntimeExecutionPlan(configuration);

    assert.equal(result.planned, true);
    if (result.planned) {
      assert.equal(result.plan.cycleId, "cycle-123");
      assertPlanSurface(result.plan, true);
    }
  });

  it("keeps cycleId absent when the request has none", () => {
    const configuration = buildLimitedConfiguration({
      mode: "dry-run",
    });

    const result = createLoopRuntimeExecutionPlan(configuration);

    assert.equal(result.planned, true);
    if (result.planned) {
      assert.equal("cycleId" in result.plan, false);
    }
  });

  it("fails closed on reference mismatches", () => {
    const configuration = buildLimitedConfiguration();
    const policyMismatch = {
      ...configuration,
      policy: {
        ...configuration.policy,
        policyRef: "other-policy",
      },
    } as LoopRuntimeLimitedRequestConfiguration;
    const profileMismatch = {
      ...configuration,
      profile: {
        ...configuration.profile,
        profileRef: "other-profile",
      },
    } as LoopRuntimeLimitedRequestConfiguration;

    assert.deepEqual(createLoopRuntimeExecutionPlan(policyMismatch), {
      planned: false,
      reason: "reference_mismatch",
    });
    assert.deepEqual(createLoopRuntimeExecutionPlan(profileMismatch), {
      planned: false,
      reason: "reference_mismatch",
    });
  });

  it("fails closed for invalid runtime plan data", () => {
    const configuration = buildLimitedConfiguration();
    const cases: Array<[
      string,
      LoopRuntimeLimitedRequestConfiguration,
      LoopRuntimeExecutionPlanFailureReason,
    ]> = [
      [
        "project",
        {
          ...configuration,
          request: {
            ...configuration.request,
            project: "   ",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "cycleId",
        {
          ...configuration,
          request: {
            ...configuration.request,
            cycleId: "   ",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "mode",
        {
          ...configuration,
          request: {
            ...configuration.request,
            mode: "invalid-mode" as unknown as "dry-run" | "execute",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "policyId",
        {
          ...configuration,
          policy: {
            ...configuration.policy,
            policyId: "   ",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "profileId",
        {
          ...configuration,
          profile: {
            ...configuration.profile,
            profileId: "   ",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "effort",
        {
          ...configuration,
          effectiveEffort: "not-an-effort" as unknown as LoopRuntimeLimitedRequestConfiguration["effectiveEffort"],
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "budget",
        {
          ...configuration,
          effectiveBudget: {
            ...configuration.effectiveBudget,
            maxTokens: -1,
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "budget-above-public",
        {
          ...configuration,
          effectiveBudget: {
            ...configuration.effectiveBudget,
            maxTokens: configuration.request.budget.maxTokens + 1,
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "effort-above-request",
        {
          ...configuration,
          effectiveEffort: "max",
          request: {
            ...configuration.request,
            requestedMaxEffort: "medium",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
      [
        "effort-above-profile",
        {
          ...configuration,
          effectiveEffort: "max",
          profile: {
            ...configuration.profile,
            maxEffort: "medium",
          },
        } as LoopRuntimeLimitedRequestConfiguration,
        "invalid_limited_configuration",
      ],
    ];

    for (const [, invalidConfiguration, reason] of cases) {
      assert.deepEqual(createLoopRuntimeExecutionPlan(invalidConfiguration), {
        planned: false,
        reason,
      });
    }
  });

  it("keeps frozen inputs unchanged and remains deterministic", () => {
    const configuration = buildLimitedConfiguration({
      cycleId: "cycle-123",
    });
    const snapshot = JSON.parse(JSON.stringify(configuration)) as typeof configuration;

    const first = createLoopRuntimeExecutionPlan(configuration);
    const second = createLoopRuntimeExecutionPlan(configuration);

    assert.equal(Object.isFrozen(configuration), true);
    assert.equal(Object.isFrozen(configuration.request), true);
    assert.equal(Object.isFrozen(configuration.policy), true);
    assert.equal(Object.isFrozen(configuration.profile), true);
    assert.equal(Object.isFrozen(configuration.effectiveBudget), true);
    assert.deepEqual(first, second);
    assert.deepEqual(configuration, snapshot);
  });

  it("exports the limited runtime execution plan contract from Core", () => {
    assert.equal(typeof createLoopRuntimeExecutionPlan, "function");
  });
});

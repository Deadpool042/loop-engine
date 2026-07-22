import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  createLoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestResolution,
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
  type LoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimeResolvedRequestConfigurationResult,
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
    requestedMaxEffort: "medium",
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

function resolvedResolution(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequestResolution<
  LoopRuntimeResolvedPolicyConfiguration,
  LoopRuntimeResolvedProfileConfiguration
> {
  const request = frozenRequest(overrides);

  return Object.freeze({
    resolved: true as const,
    request,
    policy: Object.freeze({
      policyRef: request.policyRef,
      policyId: "policy-id",
    }),
    profile: Object.freeze({
      profileRef: request.profileRef,
      profileId: "profile-id",
      maxEffort: "medium",
    }),
  });
}

describe("createLoopRuntimeResolvedRequestConfiguration", () => {
  it("returns unresolved_request when the resolution failed", () => {
    const resolution: LoopRuntimePublicRequestResolution<
      LoopRuntimeResolvedPolicyConfiguration,
      LoopRuntimeResolvedProfileConfiguration
    > = Object.freeze({
      resolved: false,
      reason: "unknown_policy_ref",
    });

    const configured = createLoopRuntimeResolvedRequestConfiguration(
      resolution,
    );

    assert.deepEqual(configured, {
      configured: false,
      reason: "unresolved_request",
    });
    assert.equal(Object.isFrozen(configured), true);
  });

  it("builds a frozen resolved configuration with preserved request and budget references", () => {
    const resolution = resolvedResolution();
    const configured = createLoopRuntimeResolvedRequestConfiguration(
      resolution,
    ) as LoopRuntimeResolvedRequestConfigurationResult;

    assert.equal(configured.configured, true);
    if (configured.configured) {
      const configuration = configured.configuration as LoopRuntimeResolvedRequestConfiguration;

      assert.equal(configuration.request, resolution.request);
      assert.deepEqual(configuration.policy, resolution.policy);
      assert.deepEqual(configuration.profile, resolution.profile);
      assert.equal(configuration.effectiveBudget, resolution.request.budget);
      assert.equal(configuration.policy.policyRef, resolution.request.policyRef);
      assert.equal(configuration.profile.profileRef, resolution.request.profileRef);
      assert.equal(configuration.profile.maxEffort, resolution.profile.maxEffort);
      assert.equal(Object.isFrozen(configured), true);
      assert.equal(Object.isFrozen(configuration), true);
      assert.equal(Object.isFrozen(configuration.policy), true);
      assert.equal(Object.isFrozen(configuration.profile), true);
    }
  });

  it("accepts frozen inputs and stays deterministic without mutating them", () => {
    const resolution = resolvedResolution({
      cycleId: "cycle-001",
    });
    const snapshot = JSON.parse(JSON.stringify(resolution)) as typeof resolution;

    const first = createLoopRuntimeResolvedRequestConfiguration(resolution);
    const second = createLoopRuntimeResolvedRequestConfiguration(resolution);

    assert.equal(Object.isFrozen(first), true);
    assert.deepEqual(first, second);
    assert.deepEqual(resolution, snapshot);
  });

  it("keeps internal contracts out of the resolved configuration surface", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-configuration.ts",
      "utf8",
    );

    const forbidden = [
      "AgentRegistry",
      "PolicyBoundLocalProcessBridgeInput",
      "AgentSelectionRequest",
      "LocalProcessExecutionBinding",
      "LocalProcessExecutionPolicy",
      "TransportRequest",
      "TransportAdapter",
      "RuntimeResult",
      "RuntimeExecutionReceipt",
      "sender",
    ];

    for (const token of forbidden) {
      assert.doesNotMatch(source, new RegExp(`\\b${token}\\b`));
    }
  });

  it("exports the resolved request configuration contract from Core", () => {
    const resolution = resolvedResolution();
    const configured: LoopRuntimeResolvedRequestConfigurationResult =
      createLoopRuntimeResolvedRequestConfiguration(resolution);

    assert.equal(configured.configured, true);
    assert.equal(
      typeof createLoopRuntimeResolvedRequestConfiguration,
      "function",
    );
  });
});

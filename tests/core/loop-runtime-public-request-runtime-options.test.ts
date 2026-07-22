import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapLoopRuntimeExecutionPlanToRequestOptions,
  type LoopRuntimeExecutionPlan,
  type LoopRuntimeRequestOptionsMapping,
  type LoopRuntimeRequestOptionsMappingFailureReason,
  type LoopRuntimeRequestOptionsMappingResult,
} from "../../src/core/index.js";

function buildPlan(
  overrides: Partial<LoopRuntimeExecutionPlan> = {},
): LoopRuntimeExecutionPlan {
  return {
    project: "loop-engine",
    mode: "execute",
    policyId: "policy-id",
    profileId: "profile-id",
    effort: "high",
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

function assertMappedOptions(
  result: LoopRuntimeRequestOptionsMappingResult,
  expected: LoopRuntimeRequestOptionsMapping,
  hasCycleId: boolean,
): void {
  assert.equal(result.mapped, true);
  if (!result.mapped) {
    throw new Error("expected a mapped runtime request options result");
  }

  assert.deepEqual(result.options, expected);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.options), true);
  assert.equal(Object.isFrozen(result.options.limits), true);
  assert.deepEqual(
    Object.keys(result.options),
    hasCycleId
      ? [
          "project",
          "mode",
          "policyId",
          "profileId",
          "effort",
          "cycleId",
          "limits",
        ]
      : ["project", "mode", "policyId", "profileId", "effort", "limits"],
  );
  assert.deepEqual(Object.keys(result.options.limits), [
    "maxTokens",
    "maxCostUsd",
    "maxDurationMs",
    "maxCalls",
    "maxRepairs",
  ]);
  assert.equal("requestedRuntime" in result.options, false);
  assert.equal("allowedProviders" in result.options, false);
  assert.equal("allowedRuntimes" in result.options, false);
  assert.equal("localProcess" in result.options, false);
  assert.equal("request" in result.options, false);
  assert.equal("plan" in result.options, false);
  assert.equal("policyRef" in result.options, false);
  assert.equal("profileRef" in result.options, false);
  assert.equal("requestedMaxEffort" in result.options, false);
  assert.equal("sender" in result.options, false);
  assert.equal("destination" in result.options, false);
  assert.equal("headers" in result.options, false);
  assert.equal("environment" in result.options, false);
  assert.equal("cwd" in result.options, false);
  assert.equal("executable" in result.options, false);
  assert.equal("arguments" in result.options, false);
  assert.equal("provider" in result.options, false);
  assert.equal("model" in result.options, false);
  assert.equal("failureReason" in result.options, false);
}

describe("mapLoopRuntimeExecutionPlanToRequestOptions", () => {
  it("maps a valid dry-run plan and omits cycleId when absent", () => {
    const plan = Object.freeze({
      ...buildPlan({
        mode: "dry-run",
      }),
      budget: Object.freeze(buildPlan().budget),
    }) as LoopRuntimeExecutionPlan;
    const before = JSON.parse(JSON.stringify(plan)) as LoopRuntimeExecutionPlan;
    const result = mapLoopRuntimeExecutionPlanToRequestOptions(plan);

    assertMappedOptions(
      result,
      {
        project: "loop-engine",
        mode: "dry-run",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "high",
        limits: {
          maxTokens: 10,
          maxCostUsd: 20,
          maxDurationMs: 30,
          maxCalls: 40,
          maxRepairs: 50,
        },
      },
      false,
    );
    assert.deepEqual(plan, before);
    assert.equal(result.mapped, true);
    if (result.mapped) {
      assert.notEqual(result.options.limits, plan.budget);
    }
  });

  it("maps a valid execute plan and preserves cycleId", () => {
    const plan = Object.freeze({
      ...buildPlan({
        cycleId: "cycle-123",
      }),
      budget: Object.freeze(buildPlan().budget),
    }) as LoopRuntimeExecutionPlan;
    const result = mapLoopRuntimeExecutionPlanToRequestOptions(plan);

    assertMappedOptions(
      result,
      {
        project: "loop-engine",
        cycleId: "cycle-123",
        mode: "execute",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "high",
        limits: {
          maxTokens: 10,
          maxCostUsd: 20,
          maxDurationMs: 30,
          maxCalls: 40,
          maxRepairs: 50,
        },
      },
      true,
    );
  });

  it("fails closed on invalid execution plan values", () => {
    const invalidCases: Array<[
      string,
      LoopRuntimeExecutionPlan,
      LoopRuntimeRequestOptionsMappingFailureReason,
    ]> = [
      [
        "mode",
        {
          ...buildPlan({ mode: "invalid-mode" as unknown as LoopRuntimeExecutionPlan["mode"] }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "unsupported_mode",
      ],
      [
        "project",
        {
          ...buildPlan({ project: "   " }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "cycleId",
        {
          ...buildPlan({ cycleId: "   " }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "policyId",
        {
          ...buildPlan({ policyId: "   " }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "profileId",
        {
          ...buildPlan({ profileId: "   " }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "effort",
        {
          ...buildPlan({ effort: "impossible" as unknown as LoopRuntimeExecutionPlan["effort"] }),
          budget: Object.freeze(buildPlan().budget),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxTokens negative",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxTokens: -1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxTokens: -1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxCostUsd negative",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxCostUsd: -1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxCostUsd: -1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxDurationMs negative",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxDurationMs: -1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxDurationMs: -1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxCalls negative",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxCalls: -1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxCalls: -1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxRepairs negative",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxRepairs: -1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxRepairs: -1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxTokens not safe integer",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxTokens: Number.MAX_SAFE_INTEGER + 1,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxTokens: Number.MAX_SAFE_INTEGER + 1,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
      [
        "maxCostUsd not finite",
        {
          ...buildPlan({
            budget: {
              ...buildPlan().budget,
              maxCostUsd: Number.POSITIVE_INFINITY,
            },
          }),
          budget: Object.freeze({
            ...buildPlan().budget,
            maxCostUsd: Number.POSITIVE_INFINITY,
          }),
        } as LoopRuntimeExecutionPlan,
        "invalid_execution_plan",
      ],
    ];

    for (const [label, plan, reason] of invalidCases) {
      const result = mapLoopRuntimeExecutionPlanToRequestOptions(plan);

      assert.equal(result.mapped, false, label);
      if (!result.mapped) {
        assert.equal(result.reason, reason);
      }
    }
  });

  it("accepts zeroed limits and remains deterministic", () => {
    const plan = Object.freeze({
      ...buildPlan({
        mode: "execute",
        budget: {
          maxTokens: 0,
          maxCostUsd: 0,
          maxDurationMs: 0,
          maxCalls: 0,
          maxRepairs: 0,
        },
      }),
      budget: Object.freeze({
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      }),
    }) as LoopRuntimeExecutionPlan;
    const first = mapLoopRuntimeExecutionPlanToRequestOptions(plan);
    const second = mapLoopRuntimeExecutionPlanToRequestOptions(plan);

    assert.deepEqual(first, second);
    assertMappedOptions(
      first,
      {
        project: "loop-engine",
        mode: "execute",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "high",
        limits: {
          maxTokens: 0,
          maxCostUsd: 0,
          maxDurationMs: 0,
          maxCalls: 0,
          maxRepairs: 0,
        },
      },
      false,
    );
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.budget), true);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  validateLoopRuntimePublicRequest,
  type LoopRuntimePublicRequest,
} from "../../src/core/index.js";

function validRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "fixture-project",
    mode: "dry-run",
    policyRef: "policy.fixture",
    profileRef: "profile.fixture",
    requestedMaxEffort: "medium",
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
  const request = validRequest(overrides);

  Object.freeze(request.budget);
  return Object.freeze(request);
}

describe("Loop Runtime Public Request", () => {
  it("validates a dry-run request deterministically", () => {
    const request = frozenRequest();

    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
    assert.equal(Object.isFrozen(validateLoopRuntimePublicRequest(request)), true);
    assert.deepEqual(request, validRequest());
  });

  it("validates an execute request deterministically", () => {
    const request = frozenRequest({ mode: "execute" });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
    assert.deepEqual(request, validRequest({ mode: "execute" }));
  });

  it("rejects unsupported schema versions", () => {
    const request = frozenRequest({
      schemaVersion: 2 as LoopRuntimePublicRequest["schemaVersion"],
    });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: false,
      reason: "unsupported_schema",
    });
  });

  it("rejects empty required references", () => {
    const cases: Array<[
      string,
      Partial<LoopRuntimePublicRequest>,
      "invalid_project" | "invalid_policy_ref" | "invalid_profile_ref",
    ]> = [
      ["project", { project: "" }, "invalid_project"],
      ["project trim", { project: "   " }, "invalid_project"],
      ["policyRef", { policyRef: "" }, "invalid_policy_ref"],
      ["policyRef trim", { policyRef: "   " }, "invalid_policy_ref"],
      ["profileRef", { profileRef: "" }, "invalid_profile_ref"],
      ["profileRef trim", { profileRef: "   " }, "invalid_profile_ref"],
    ];

    for (const [, overrides, reason] of cases) {
      const request = frozenRequest(overrides);

      assert.deepEqual(validateLoopRuntimePublicRequest(request), {
        valid: false,
        reason,
      });
    }
  });

  it("rejects empty cycle identifiers when present", () => {
    const request = frozenRequest({ cycleId: "   " });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: false,
      reason: "invalid_cycle_id",
    });
  });

  it("rejects invalid modes", () => {
    const request = frozenRequest({
      mode: "plan" as unknown as LoopRuntimePublicRequest["mode"],
    });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: false,
      reason: "invalid_mode",
    });
  });

  it("rejects invalid efforts", () => {
    const request = frozenRequest({
      requestedMaxEffort: "extreme" as unknown as LoopRuntimePublicRequest["requestedMaxEffort"],
    });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: false,
      reason: "invalid_effort",
    });
  });

  it("rejects invalid budgets", () => {
    const cases: Array<[
      string,
      LoopRuntimePublicRequest["budget"],
      "invalid_budget",
    ]> = [
      ["negative maxTokens", { maxTokens: -1, maxCostUsd: 0, maxDurationMs: 0, maxCalls: 0, maxRepairs: 0 }, "invalid_budget"],
      ["negative maxCostUsd", { maxTokens: 0, maxCostUsd: -1, maxDurationMs: 0, maxCalls: 0, maxRepairs: 0 }, "invalid_budget"],
      ["negative maxDurationMs", { maxTokens: 0, maxCostUsd: 0, maxDurationMs: -1, maxCalls: 0, maxRepairs: 0 }, "invalid_budget"],
      ["negative maxCalls", { maxTokens: 0, maxCostUsd: 0, maxDurationMs: 0, maxCalls: -1, maxRepairs: 0 }, "invalid_budget"],
      ["negative maxRepairs", { maxTokens: 0, maxCostUsd: 0, maxDurationMs: 0, maxCalls: 0, maxRepairs: -1 }, "invalid_budget"],
      ["unsafe integer", { maxTokens: Number.MAX_SAFE_INTEGER + 1, maxCostUsd: 0, maxDurationMs: 0, maxCalls: 0, maxRepairs: 0 }, "invalid_budget"],
      ["non-finite", { maxTokens: 0, maxCostUsd: Infinity, maxDurationMs: 0, maxCalls: 0, maxRepairs: 0 }, "invalid_budget"],
    ];

    for (const [, budget, reason] of cases) {
      const request = frozenRequest({ budget });

      assert.deepEqual(validateLoopRuntimePublicRequest(request), {
        valid: false,
        reason,
      });
    }
  });

  it("accepts zero-valued budgets", () => {
    const request = frozenRequest({
      budget: {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      },
    });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
  });

  it("does not mutate inputs", () => {
    const request = frozenRequest({
      cycleId: "cycle-001",
      budget: {
        maxTokens: 1,
        maxCostUsd: 1,
        maxDurationMs: 1,
        maxCalls: 1,
        maxRepairs: 1,
      },
    });
    const snapshot = JSON.parse(JSON.stringify(request)) as LoopRuntimePublicRequest;

    assert.deepEqual(validateLoopRuntimePublicRequest(request), { valid: true });
    assert.deepEqual(request, snapshot);
  });

  it("is deterministic", () => {
    const request = frozenRequest({
      cycleId: "cycle-001",
      budget: {
        maxTokens: 12,
        maxCostUsd: 34,
        maxDurationMs: 56,
        maxCalls: 7,
        maxRepairs: 8,
      },
    });

    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: true,
    });
    assert.deepEqual(validateLoopRuntimePublicRequest(request), {
      valid: true,
    });
  });

  it("keeps internal contracts out of the public request surface", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request.ts",
      "utf8",
    );

    for (const forbidden of [
      "AgentRegistry",
      "AgentSelectionRequest",
      "LocalProcessExecutionBinding",
      "LocalProcessExecutionPolicy",
      "PolicyBoundLocalProcessBridgeInput",
      "sender",
      "executable",
      "cwd",
      "environment",
      "headers",
      "destination",
      "provider",
      "model",
      "capabilities",
      "permissions",
      "failureReason",
    ]) {
      assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`));
    }
  });
});

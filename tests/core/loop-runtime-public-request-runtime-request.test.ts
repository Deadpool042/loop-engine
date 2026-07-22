import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createLoopRuntimeRequestFromPublicOptions,
  type LoopRuntimeConstructedRuntimeRequest,
  type LoopRuntimeRequestBinding,
  type LoopRuntimeRequestConstructionFailureReason,
  type LoopRuntimeRequestConstructionResult,
  type LoopRuntimeRequestOptionsMapping,
} from "../../src/core/index.js";

function buildOptions(
  overrides: Partial<LoopRuntimeRequestOptionsMapping> = {},
): LoopRuntimeRequestOptionsMapping {
  return {
    project: "loop-engine",
    mode: "execute",
    policyId: "policy-id",
    profileId: "profile-id",
    effort: "medium",
    limits: {
      maxTokens: 10,
      maxCostUsd: 20,
      maxDurationMs: 30,
      maxCalls: 40,
      maxRepairs: 50,
    },
    ...overrides,
  };
}

function buildBinding(
  overrides: Partial<LoopRuntimeRequestBinding> = {},
): LoopRuntimeRequestBinding {
  return {
    runtimeId: "local-process",
    executable: "node",
    arguments: ["--version"],
    cwd: ".",
    ...overrides,
  };
}

function assertConstructedRequest(
  result: LoopRuntimeRequestConstructionResult,
  expected: LoopRuntimeConstructedRuntimeRequest,
  hasCycleId: boolean,
  hasCwd: boolean,
): void {
  assert.equal(result.constructed, true);
  if (!result.constructed) {
    throw new Error("expected constructed runtime request");
  }

  assert.deepEqual(result.request, expected);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.request), true);
  assert.equal(Object.isFrozen(result.request.limits), true);
  assert.equal(Object.isFrozen(result.request.command), true);
  assert.equal(Object.isFrozen(result.request.command.arguments), true);
  assert.deepEqual(
    Object.keys(result.request),
    hasCycleId
      ? [
          "runtimeId",
          "project",
          "mode",
          "policyId",
          "profileId",
          "effort",
          "cycleId",
          "limits",
          "command",
        ]
      : [
          "runtimeId",
          "project",
          "mode",
          "policyId",
          "profileId",
          "effort",
          "limits",
          "command",
        ],
  );
  assert.deepEqual(
    Object.keys(result.request.command),
    hasCwd ? ["executable", "arguments", "cwd"] : ["executable", "arguments"],
  );

  for (const forbidden of [
    "AgentRegistry",
    "AgentSelectionRequest",
    "PolicyBoundLocalProcessBridgeInput",
    "LocalProcessExecutionPolicy",
    "RuntimeResult",
    "runtimeCapabilities",
    "runtimeMapping",
    "loopRunResult",
    "sender",
    "destination",
    "headers",
    "environment",
    "provider",
    "model",
    "failureReason",
    "receipt",
    "diagnostics",
  ]) {
    assert.equal(forbidden in result.request, false, forbidden);
    assert.equal(forbidden in result.request.command, false, forbidden);
  }
}

describe("createLoopRuntimeRequestFromPublicOptions", () => {
  it("constructs a valid execute request without cycleId", () => {
    const options = Object.freeze({
      ...buildOptions(),
      limits: Object.freeze(buildOptions().limits),
    }) as LoopRuntimeRequestOptionsMapping;
    const binding = Object.freeze({
      runtimeId: "local-process",
      executable: "node",
      arguments: Object.freeze(["--version"]),
    }) as LoopRuntimeRequestBinding;
    const optionsBefore = JSON.parse(JSON.stringify(options));
    const bindingBefore = JSON.parse(JSON.stringify(binding));
    const result = createLoopRuntimeRequestFromPublicOptions(options, binding);

    assertConstructedRequest(
      result,
      {
        runtimeId: "local-process",
        project: "loop-engine",
        mode: "execute",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "medium",
        limits: {
          maxTokens: 10,
          maxCostUsd: 20,
          maxDurationMs: 30,
          maxCalls: 40,
          maxRepairs: 50,
        },
        command: {
          executable: "node",
          arguments: ["--version"],
        },
      },
      false,
      false,
    );
    assert.deepEqual(options, optionsBefore);
    assert.deepEqual(binding, bindingBefore);
    if (result.constructed) {
      assert.notEqual(result.request.limits, options.limits);
      assert.notEqual(result.request.command.arguments, binding.arguments);
    }
  });

  it("constructs a valid execute request with cycleId and cwd", () => {
    const options = Object.freeze({
      ...buildOptions({ cycleId: "cycle-123" }),
      limits: Object.freeze(buildOptions().limits),
    }) as LoopRuntimeRequestOptionsMapping;
    const binding = Object.freeze({
      ...buildBinding({ cwd: "/workspace" }),
      arguments: Object.freeze(["script.js", "--flag"]),
    }) as LoopRuntimeRequestBinding;
    const result = createLoopRuntimeRequestFromPublicOptions(options, binding);

    assertConstructedRequest(
      result,
      {
        runtimeId: "local-process",
        project: "loop-engine",
        cycleId: "cycle-123",
        mode: "execute",
        policyId: "policy-id",
        profileId: "profile-id",
        effort: "medium",
        limits: {
          maxTokens: 10,
          maxCostUsd: 20,
          maxDurationMs: 30,
          maxCalls: 40,
          maxRepairs: 50,
        },
        command: {
          executable: "node",
          arguments: ["script.js", "--flag"],
          cwd: "/workspace",
        },
      },
      true,
      true,
    );
  });

  it("returns unsupported_dry_run without constructing a request", () => {
    assert.deepEqual(
      createLoopRuntimeRequestFromPublicOptions(
        buildOptions({ mode: "dry-run" }),
        buildBinding(),
      ),
      {
        constructed: false,
        reason: "unsupported_dry_run",
      },
    );
  });

  it("fails closed for invalid options", () => {
    const cases: Array<[string, LoopRuntimeRequestOptionsMapping]> = [
      ["project", buildOptions({ project: "   " })],
      ["cycleId", buildOptions({ cycleId: "   " })],
      ["policyId", buildOptions({ policyId: "   " })],
      ["profileId", buildOptions({ profileId: "   " })],
      [
        "effort",
        buildOptions({
          effort: "impossible" as unknown as LoopRuntimeRequestOptionsMapping["effort"],
        }),
      ],
      [
        "mode",
        buildOptions({
          mode: "invalid" as unknown as LoopRuntimeRequestOptionsMapping["mode"],
        }),
      ],
      [
        "maxTokens",
        buildOptions({ limits: { ...buildOptions().limits, maxTokens: -1 } }),
      ],
      [
        "maxCostUsd",
        buildOptions({
          limits: { ...buildOptions().limits, maxCostUsd: Number.NaN },
        }),
      ],
      [
        "maxDurationMs",
        buildOptions({
          limits: {
            ...buildOptions().limits,
            maxDurationMs: Number.MAX_SAFE_INTEGER + 1,
          },
        }),
      ],
      [
        "maxCalls",
        buildOptions({ limits: { ...buildOptions().limits, maxCalls: -1 } }),
      ],
      [
        "maxRepairs",
        buildOptions({ limits: { ...buildOptions().limits, maxRepairs: -1 } }),
      ],
    ];

    for (const [label, options] of cases) {
      const result = createLoopRuntimeRequestFromPublicOptions(
        options,
        buildBinding(),
      );

      assert.equal(result.constructed, false, label);
      if (!result.constructed) {
        assert.equal(result.reason, "invalid_options");
      }
    }
  });

  it("fails closed for invalid bindings", () => {
    const cases: Array<[
      string,
      LoopRuntimeRequestBinding,
      LoopRuntimeRequestConstructionFailureReason,
    ]> = [
      ["runtimeId", buildBinding({ runtimeId: "   " }), "invalid_binding"],
      ["executable", buildBinding({ executable: "   " }), "invalid_binding"],
      [
        "arguments array",
        buildBinding({
          arguments: "not-array" as unknown as readonly string[],
        }),
        "invalid_binding",
      ],
      [
        "argument value",
        buildBinding({
          arguments: ["ok", 1 as unknown as string],
        }),
        "invalid_binding",
      ],
      ["cwd", buildBinding({ cwd: "   " }), "invalid_binding"],
    ];

    for (const [label, binding, reason] of cases) {
      const result = createLoopRuntimeRequestFromPublicOptions(
        buildOptions(),
        binding,
      );

      assert.equal(result.constructed, false, label);
      if (!result.constructed) {
        assert.equal(result.reason, reason);
      }
    }
  });

  it("accepts zero limits and remains deterministic", () => {
    const options = Object.freeze({
      ...buildOptions({
        limits: {
          maxTokens: 0,
          maxCostUsd: 0,
          maxDurationMs: 0,
          maxCalls: 0,
          maxRepairs: 0,
        },
      }),
      limits: Object.freeze({
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      }),
    }) as LoopRuntimeRequestOptionsMapping;
    const binding = Object.freeze({
      ...buildBinding(),
      arguments: Object.freeze(["--version"]),
    }) as LoopRuntimeRequestBinding;
    const first = createLoopRuntimeRequestFromPublicOptions(options, binding);
    const second = createLoopRuntimeRequestFromPublicOptions(options, binding);

    assert.deepEqual(first, second);
    assert.equal(first.constructed, true);
    if (first.constructed) {
      assert.deepEqual(first.request.limits, {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      });
    }
  });

  it("does not import execution, bridge, agent orchestration, or transport contracts", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-runtime-request.ts",
      "utf8",
    );

    assert.doesNotMatch(source, /LocalProcessRuntimeRequest/);
    assert.doesNotMatch(source, /PolicyBoundLocalProcessBridgeInput/);
    assert.doesNotMatch(source, /LocalProcessExecutionBinding/);
    assert.doesNotMatch(source, /LocalProcessExecutionPolicy/);
    assert.doesNotMatch(source, /RuntimeResult/);
    assert.doesNotMatch(source, /AgentSelectionRequest/);
    assert.doesNotMatch(source, /AgentRegistry/);
    assert.doesNotMatch(source, /process\.env/);
    assert.doesNotMatch(source, /child_process|spawn\(|exec\(|fetch\(/);
  });
});

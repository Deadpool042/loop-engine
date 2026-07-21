import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  type LoopRuntimeExecutionOutcome,
  type LoopRuntimeFailure,
} from "../../src/core/index.js";
import type { PolicyBoundLocalProcessExecutionResult } from "../../src/core/runtime-execution-bridge.js";
import type { RuntimeResult, RuntimeResultStatus } from "../../src/runtime/types.js";

function runtimeResult(status: RuntimeResultStatus): RuntimeResult {
  return {
    runtimeId: "local-process",
    status,
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    diagnostics: ["fixture"],
    output: null,
    metadata: {},
  };
}

function executedResult(status: RuntimeResultStatus): PolicyBoundLocalProcessExecutionResult {
  return {
    outcome: "executed",
    resolution: {
      outcome: "resolved",
      descriptorId: "runtime-a",
      runtimeId: "local-process",
      declarativeSelection: {
        outcome: "selected",
        selectedRuntimeId: "local-process",
        selectedDescriptorId: "runtime-a",
        compatibleRuntimeIds: ["local-process"],
        evaluatedRuntimeIds: ["local-process"],
        requirements: [],
        candidates: [],
      },
      admission: {
        outcome: "admitted",
        policyId: "fixture-policy",
        mode: "execute",
        status: "resolved",
        checks: [],
        diagnosticCodes: [],
      },
      runtimeRequest: {
        task: {
          path: "roadmap.md",
          line: 1,
          text: "- [ ] fixture",
          kind: "safe",
          reason: "fixture",
          status: "todo",
          priority: "default",
        },
        mode: "execute",
        contextPackage: {
          project: "fixture",
          budget: {
            maxFiles: 1,
            maxCharacters: 10,
            maxEstimatedTokens: 3,
            includeFullFiles: false,
          },
          files: [],
          omitted: [],
          totalCharacters: 0,
          estimatedTokens: 0,
          truncated: false,
        },
        resolvedAgentPolicy: {
          policyId: "fixture-policy",
          mode: "execute",
          status: "resolved",
          requirements: {
            category: "code",
            mode: "execute",
            requiredCapabilities: [],
            requiredPermissions: [],
            minimumEffort: "low",
            maximumEffort: "low",
            contextBudget: {
              maxFiles: 1,
              maxCharacters: 10,
              maxEstimatedTokens: 3,
              includeFullFiles: false,
            },
            executionBudget: {
              maxTokens: null,
              maxCostUsd: null,
              maxDurationMs: null,
              maxCalls: 1,
              maxRepairs: 0,
            },
            rationale: ["fixture"],
          },
          selectionRequest: {
            requiredCapabilities: [],
            requiredPermissions: [],
          },
          selection: null,
          reasons: ["fixture"],
        },
        provider: "local",
        effort: "low",
        requestedAt: "2026-07-21T00:00:00.000Z",
        metadata: {},
        requestedRuntime: "local-process",
      },
      v10Resolution: {
        outcome: "resolved",
        runtimeId: "local-process",
        provider: "local",
        runtimeRequest: {
          task: {
            path: "roadmap.md",
            line: 1,
            text: "- [ ] fixture",
            kind: "safe",
            reason: "fixture",
            status: "todo",
            priority: "default",
          },
          mode: "execute",
          contextPackage: {
            project: "fixture",
            budget: {
              maxFiles: 1,
              maxCharacters: 10,
              maxEstimatedTokens: 3,
              includeFullFiles: false,
            },
            files: [],
            omitted: [],
            totalCharacters: 0,
            estimatedTokens: 0,
            truncated: false,
          },
          resolvedAgentPolicy: {
            policyId: "fixture-policy",
            mode: "execute",
            status: "resolved",
            requirements: {
              category: "code",
              mode: "execute",
              requiredCapabilities: [],
              requiredPermissions: [],
              minimumEffort: "low",
              maximumEffort: "low",
              contextBudget: {
                maxFiles: 1,
                maxCharacters: 10,
                maxEstimatedTokens: 3,
                includeFullFiles: false,
              },
              executionBudget: {
                maxTokens: null,
                maxCostUsd: null,
                maxDurationMs: null,
                maxCalls: 1,
                maxRepairs: 0,
              },
              rationale: ["fixture"],
            },
            selectionRequest: {
              requiredCapabilities: [],
              requiredPermissions: [],
            },
            selection: null,
            reasons: ["fixture"],
          },
          provider: "local",
          effort: "low",
          requestedAt: "2026-07-21T00:00:00.000Z",
          metadata: {},
          requestedRuntime: "local-process",
        },
        runtimeAdapterId: "local-process",
        diagnostics: [],
      },
      diagnostics: [],
    },
    runtimeResult: runtimeResult(status),
    receipt: {
      schemaVersion: 1,
      descriptorId: "runtime-a",
      runtimeId: "local-process",
      request: {
        task: {
          path: "roadmap.md",
          line: 1,
          text: "- [ ] fixture",
          kind: "safe",
          reason: "fixture",
          status: "todo",
          priority: "default",
        },
        mode: "execute",
        provider: "local",
        effort: "low",
        requestedAt: "2026-07-21T00:00:00.000Z",
        requestedRuntime: "local-process",
        allowedProviders: ["local"],
        allowedRuntimes: ["local-process"],
        contextPackage: {
          project: "fixture",
          budget: {
            maxFiles: 1,
            maxCharacters: 10,
            maxEstimatedTokens: 3,
            includeFullFiles: false,
          },
          files: [],
          omitted: [],
          totalCharacters: 0,
          estimatedTokens: 0,
          truncated: false,
        },
        metadata: {},
        localProcessConfigured: true,
      },
      capabilityDecision: {
        outcome: "selected",
        descriptorId: "runtime-a",
        compatibleRuntimeIds: ["local-process"],
        evaluatedRuntimeIds: ["local-process"],
        requirements: [],
      },
      policyDecision: {
        outcome: "admitted",
        policyId: "fixture-policy",
        mode: "execute",
        status: "resolved",
        checks: [],
        diagnosticCodes: [],
      },
      executionConstraints: {
        projectRoot: ".",
        allowedExecutables: [],
        allowedEnvironmentKeys: [],
        timeoutMs: 1_000,
        maxStdoutBytes: 1_000,
        maxStderrBytes: 1_000,
        termination: {
          gracefulSignal: "SIGTERM",
          forceSignal: "SIGKILL",
          gracePeriodMs: 250,
        },
      },
      reasons: [],
      outcome: {
        status,
        output: null,
        diagnostics: [],
        errorCode: null,
        errorMessage: null,
      },
    },
    diagnostics: [],
  } as unknown as PolicyBoundLocalProcessExecutionResult;
}

describe("classifyLoopRuntimeExecutionOutcome", () => {
  it("classifies not started results", () => {
    const result = classifyLoopRuntimeExecutionOutcome(null);

    assert.deepEqual(result, {
      outcome: "not_started",
      runtimeStatus: null,
    } satisfies LoopRuntimeExecutionOutcome);
    assert.ok(Object.isFrozen(result));
  });

  it("classifies completed runtime results as succeeded", () => {
    const first = classifyLoopRuntimeExecutionOutcome(executedResult("completed"));
    const second = classifyLoopRuntimeExecutionOutcome(executedResult("completed"));

    assert.deepEqual(first, {
      outcome: "succeeded",
      runtimeStatus: "completed",
    } satisfies LoopRuntimeExecutionOutcome);
    assert.deepEqual(first, second);
  });

  it("classifies timed out runtime results as timed_out", () => {
    const result = classifyLoopRuntimeExecutionOutcome(executedResult("timed_out"));

    assert.deepEqual(result, {
      outcome: "timed_out",
      runtimeStatus: "timed_out",
    } satisfies LoopRuntimeExecutionOutcome);
  });

  for (const status of [
    "not_implemented",
    "unsupported",
    "denied",
    "spawn_failed",
    "non_zero_exit",
    "stdout_limit_exceeded",
    "stderr_limit_exceeded",
  ] as const) {
    it(`classifies ${status} as failed while preserving the original status`, () => {
      const result = classifyLoopRuntimeExecutionOutcome(executedResult(status));

      assert.deepEqual(result, {
        outcome: "failed",
        runtimeStatus: status,
      } satisfies LoopRuntimeExecutionOutcome);
      assert.equal(result.runtimeStatus, status);
    });
  }

  it("does not mutate the provided runtime execution result", () => {
    const input = executedResult("completed");
    const frozen = Object.freeze({
      ...input,
      runtimeResult: Object.freeze({
        ...input.runtimeResult,
        diagnostics: Object.freeze([...input.runtimeResult.diagnostics]),
        metadata: Object.freeze({ ...input.runtimeResult.metadata }),
      }),
    }) as PolicyBoundLocalProcessExecutionResult;

    const result = classifyLoopRuntimeExecutionOutcome(frozen);

    assert.deepEqual(frozen.runtimeResult.status, "completed");
    assert.deepEqual(result, {
      outcome: "succeeded",
      runtimeStatus: "completed",
    } satisfies LoopRuntimeExecutionOutcome);
  });
});

describe("classifyLoopRuntimeFailure", () => {
  const failureKindByStatus: Record<
    RuntimeResultStatus,
    LoopRuntimeFailure["kind"]
  > = {
    not_implemented: "unsupported",
    unsupported: "unsupported",
    completed: null,
    denied: "policy_denied",
    spawn_failed: "launch_failed",
    non_zero_exit: "process_failed",
    timed_out: "timed_out",
    stdout_limit_exceeded: "output_limit",
    stderr_limit_exceeded: "output_limit",
  };

  it("classifies not_started as null", () => {
    const outcome = classifyLoopRuntimeExecutionOutcome(null);
    const failure = classifyLoopRuntimeFailure(outcome);

    assert.deepEqual(failure, {
      kind: null,
      runtimeStatus: null,
    } satisfies LoopRuntimeFailure);
    assert.ok(Object.isFrozen(failure));
  });

  it("classifies success as null", () => {
    const outcome = classifyLoopRuntimeExecutionOutcome(
      executedResult("completed"),
    );
    const failure = classifyLoopRuntimeFailure(outcome);

    assert.deepEqual(failure, {
      kind: null,
      runtimeStatus: "completed",
    } satisfies LoopRuntimeFailure);
  });

  for (const status of [
    "denied",
    "not_implemented",
    "unsupported",
    "spawn_failed",
    "non_zero_exit",
    "timed_out",
    "stdout_limit_exceeded",
    "stderr_limit_exceeded",
  ] as const) {
    it(`maps ${status} to ${failureKindByStatus[status] ?? "null"}`, () => {
      const outcome = classifyLoopRuntimeExecutionOutcome(executedResult(status));
      const first = classifyLoopRuntimeFailure(outcome);
      const second = classifyLoopRuntimeFailure(outcome);

      assert.deepEqual(first, {
        kind: failureKindByStatus[status],
        runtimeStatus: status,
      } satisfies LoopRuntimeFailure);
      assert.deepEqual(first, second);
    });
  }

  it("groups both unsupported statuses into the same failure kind", () => {
    const notImplemented = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("not_implemented")),
    );
    const unsupported = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("unsupported")),
    );

    assert.deepEqual(notImplemented, {
      kind: "unsupported",
      runtimeStatus: "not_implemented",
    } satisfies LoopRuntimeFailure);
    assert.deepEqual(unsupported, {
      kind: "unsupported",
      runtimeStatus: "unsupported",
    } satisfies LoopRuntimeFailure);
  });

  it("groups both output limit statuses into the same failure kind", () => {
    const stdout = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(
        executedResult("stdout_limit_exceeded"),
      ),
    );
    const stderr = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(
        executedResult("stderr_limit_exceeded"),
      ),
    );

    assert.deepEqual(stdout, {
      kind: "output_limit",
      runtimeStatus: "stdout_limit_exceeded",
    } satisfies LoopRuntimeFailure);
    assert.deepEqual(stderr, {
      kind: "output_limit",
      runtimeStatus: "stderr_limit_exceeded",
    } satisfies LoopRuntimeFailure);
  });

  it("preserves the original runtime status", () => {
    const failure = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("non_zero_exit")),
    );

    assert.equal(failure.runtimeStatus, "non_zero_exit");
  });

  it("covers every runtime status exhaustively", () => {
    const statuses = Object.keys(failureKindByStatus) as RuntimeResultStatus[];

    assert.deepEqual(
      statuses.map((status) => [
        status,
        classifyLoopRuntimeFailure(
          classifyLoopRuntimeExecutionOutcome(executedResult(status)),
        ).kind,
      ]),
      statuses.map((status) => [status, failureKindByStatus[status]]),
    );
  });

  it("does not mutate the provided outcome", () => {
    const outcome = Object.freeze(
      classifyLoopRuntimeExecutionOutcome(executedResult("timed_out")),
    ) as LoopRuntimeExecutionOutcome;

    const failure = classifyLoopRuntimeFailure(outcome);

    assert.deepEqual(outcome, {
      outcome: "timed_out",
      runtimeStatus: "timed_out",
    } satisfies LoopRuntimeExecutionOutcome);
    assert.deepEqual(failure, {
      kind: "timed_out",
      runtimeStatus: "timed_out",
    } satisfies LoopRuntimeFailure);
  });
});

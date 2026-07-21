import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  evaluateLoopRuntimeEscalation,
  type LoopRuntimeExecutionOutcome,
  type LoopRuntimeEscalationDecision,
  type LoopRuntimeEscalationPolicy,
  type LoopRuntimeFailure,
  type LoopRuntimeFailureKind,
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

describe("evaluateLoopRuntimeEscalation", () => {
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

  const eligiblePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze([
      "policy_denied",
      "unsupported",
      "launch_failed",
      "process_failed",
      "timed_out",
      "output_limit",
    ] as const),
  }) satisfies LoopRuntimeEscalationPolicy;

  const duplicatePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze([
      "unsupported",
      "unsupported",
      "timed_out",
      "timed_out",
    ] as const),
  }) satisfies LoopRuntimeEscalationPolicy;

  it("returns none/no_failure when there is no failure", () => {
    const decision = evaluateLoopRuntimeEscalation(null, eligiblePolicy);

    assert.deepEqual(
      decision,
      {
        action: "none",
        reason: "no_failure",
        failureKind: null,
        runtimeStatus: null,
      } satisfies LoopRuntimeEscalationDecision,
    );
    assert.ok(Object.isFrozen(decision));
  });

  it("returns escalate/failure_eligible when the failure kind is eligible", () => {
    const outcome = classifyLoopRuntimeExecutionOutcome(
      executedResult("spawn_failed"),
    );
    const failure = classifyLoopRuntimeFailure(outcome);
    const decision = evaluateLoopRuntimeEscalation(failure, eligiblePolicy);

    assert.deepEqual(
      decision,
      {
        action: "escalate",
        reason: "failure_eligible",
        failureKind: "launch_failed",
        runtimeStatus: "spawn_failed",
      } satisfies LoopRuntimeEscalationDecision,
    );
  });

  it("returns none/failure_not_eligible when the failure kind is not eligible", () => {
    const outcome = classifyLoopRuntimeExecutionOutcome(
      executedResult("spawn_failed"),
    );
    const failure = classifyLoopRuntimeFailure(outcome);
    const decision = evaluateLoopRuntimeEscalation(failure, {
      eligibleFailureKinds: Object.freeze(["timed_out"] as const),
    });

    assert.deepEqual(
      decision,
      {
        action: "none",
        reason: "failure_not_eligible",
        failureKind: "launch_failed",
        runtimeStatus: "spawn_failed",
      } satisfies LoopRuntimeEscalationDecision,
    );
  });

  for (const [status, expectedKind] of Object.entries(
    failureKindByStatus,
  ) as Array<[RuntimeResultStatus, LoopRuntimeFailureKind | null]>) {
    it(`preserves failure metadata for ${status}`, () => {
      const failure = classifyLoopRuntimeFailure(
        classifyLoopRuntimeExecutionOutcome(executedResult(status)),
      );
      const decision = evaluateLoopRuntimeEscalation(failure, eligiblePolicy);

      assert.equal(decision.failureKind, expectedKind);
      assert.equal(decision.runtimeStatus, status);
    });
  }

  it("treats an empty policy as non-eligible", () => {
    const failure = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("timed_out")),
    );
    const decision = evaluateLoopRuntimeEscalation(failure, {
      eligibleFailureKinds: [],
    });

    assert.deepEqual(
      decision,
      {
        action: "none",
        reason: "failure_not_eligible",
        failureKind: "timed_out",
        runtimeStatus: "timed_out",
      } satisfies LoopRuntimeEscalationDecision,
    );
  });

  it("accepts a readonly policy with duplicate kinds", () => {
    const failure = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("unsupported")),
    );
    const decision = evaluateLoopRuntimeEscalation(failure, duplicatePolicy);

    assert.deepEqual(
      decision,
      {
        action: "escalate",
        reason: "failure_eligible",
        failureKind: "unsupported",
        runtimeStatus: "unsupported",
      } satisfies LoopRuntimeEscalationDecision,
    );
  });

  it("does not mutate the provided failure or policy", () => {
    const policy = Object.freeze({
      eligibleFailureKinds: Object.freeze([
        "policy_denied",
        "timed_out",
      ] as const),
    }) satisfies LoopRuntimeEscalationPolicy;
    const failure = Object.freeze(
      classifyLoopRuntimeFailure(
        classifyLoopRuntimeExecutionOutcome(executedResult("timed_out")),
      ),
    ) as LoopRuntimeFailure;

    const decision = evaluateLoopRuntimeEscalation(failure, policy);

    assert.deepEqual(failure, {
      kind: "timed_out",
      runtimeStatus: "timed_out",
    } satisfies LoopRuntimeFailure);
    assert.deepEqual(policy.eligibleFailureKinds, [
      "policy_denied",
      "timed_out",
    ]);
    assert.deepEqual(decision, {
      action: "escalate",
      reason: "failure_eligible",
      failureKind: "timed_out",
      runtimeStatus: "timed_out",
    } satisfies LoopRuntimeEscalationDecision);
  });

  it("is deterministic across repeated calls", () => {
    const failure = classifyLoopRuntimeFailure(
      classifyLoopRuntimeExecutionOutcome(executedResult("non_zero_exit")),
    );
    const policy = {
      eligibleFailureKinds: ["process_failed"],
    } satisfies LoopRuntimeEscalationPolicy;

    const first = evaluateLoopRuntimeEscalation(failure, policy);
    const second = evaluateLoopRuntimeEscalation(failure, policy);

    assert.deepEqual(first, second);
  });
});

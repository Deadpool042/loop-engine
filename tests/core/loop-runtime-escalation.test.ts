import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAgentEscalationRequestFromRuntimeDecision,
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  evaluateLoopRuntimeEscalation,
  evaluateLoopRuntimeAgentEscalation,
  evaluateRuntimeAgentEscalation,
  type CreateAgentEscalationRequestFromRuntimeDecisionInput,
} from "../../src/core/index.js";
import type { AgentEscalationRequest } from "../../src/agents/escalation.js";
import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentRegistry } from "../../src/agents/registry.js";
import type { AgentSelectionRequest } from "../../src/agents/selector.js";
import type { LoopRuntimeEscalationDecision } from "../../src/core/loop-runtime-outcome.js";
import type { PolicyBoundLocalProcessExecutionResult } from "../../src/core/runtime-execution-bridge.js";
import type { RuntimeResult } from "../../src/runtime/types.js";

const registry = Object.freeze({
  profiles: Object.freeze([]),
}) satisfies AgentRegistry;

const request = Object.freeze({
  requiredCapabilities: Object.freeze(["code_edit"] as const),
  requiredPermissions: Object.freeze([] as const),
  minEffort: "low",
  maxEffort: "max",
  budgetCeiling: Object.freeze({
    maxTokens: 1_000,
    maxCostUsd: null,
    maxDurationMs: null,
    maxCalls: null,
    maxRepairs: null,
  }),
}) satisfies AgentSelectionRequest;

const escalationRequestWithoutBudgetCeiling = Object.freeze({
  requiredCapabilities: Object.freeze(["code_edit"] as const),
  requiredPermissions: Object.freeze([] as const),
  minEffort: "low",
  maxEffort: "max",
}) satisfies AgentSelectionRequest;

const escalationRegistry = createAgentRegistry([
  {
    id: "agent-low",
    runtime: "custom",
    provider: "local",
    model: "fixture-model",
    effort: "low",
    capabilities: ["code_edit"],
    permissions: [],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: null,
      maxRepairs: null,
    },
  },
  {
    id: "agent-high",
    runtime: "custom",
    provider: "local",
    model: "fixture-model",
    effort: "high",
    capabilities: ["code_edit"],
    permissions: [],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: null,
      maxRepairs: null,
    },
  },
]);

const escalationRequest: AgentEscalationRequest = Object.freeze({
  registry: escalationRegistry,
  request: escalationRequestWithoutBudgetCeiling,
  previousProfileId: "agent-low",
  failureReason: "runtime_error",
});

function runtimeResult(status: RuntimeResult["status"]): RuntimeResult {
  return {
    runtimeId: "codex",
    status,
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    diagnostics: [],
    output: null,
    metadata: {},
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
  };
}

function executedResult(
  status: RuntimeResult["status"],
): PolicyBoundLocalProcessExecutionResult {
  return {
    runtimeResult: runtimeResult(status),
  } as PolicyBoundLocalProcessExecutionResult;
}

function buildDecision(
  action: LoopRuntimeEscalationDecision["action"],
): LoopRuntimeEscalationDecision {
  return Object.freeze({
    action,
    reason: action === "escalate" ? "failure_eligible" : "no_failure",
    failureKind: action === "escalate" ? "process_failed" : null,
    runtimeStatus: action === "escalate" ? "non_zero_exit" : null,
  }) satisfies LoopRuntimeEscalationDecision;
}

function buildInput(
  decision: LoopRuntimeEscalationDecision,
): CreateAgentEscalationRequestFromRuntimeDecisionInput {
  return Object.freeze({
    decision,
    registry,
    request,
    previousProfileId: "agent-low",
    failureReason: "runtime_error",
  }) satisfies CreateAgentEscalationRequestFromRuntimeDecisionInput;
}

describe("createAgentEscalationRequestFromRuntimeDecision", () => {
  it("returns null when the runtime decision does not escalate", () => {
    const input = buildInput(buildDecision("none"));

    assert.equal(createAgentEscalationRequestFromRuntimeDecision(input), null);
  });

  it("returns null when the runtime decision is failure_not_eligible", () => {
    const input = Object.freeze({
      ...buildInput(buildDecision("none")),
      decision: Object.freeze({
        action: "none",
        reason: "failure_not_eligible",
        failureKind: "process_failed",
        runtimeStatus: "non_zero_exit",
      }) satisfies LoopRuntimeEscalationDecision,
    });

    assert.equal(createAgentEscalationRequestFromRuntimeDecision(input), null);
  });

  it("returns an AgentEscalationRequest when the runtime decision escalates", () => {
    const input = buildInput(buildDecision("escalate"));
    const result = createAgentEscalationRequestFromRuntimeDecision(input);

    assert.deepEqual(result, {
      registry,
      request,
      previousProfileId: "agent-low",
      failureReason: "runtime_error",
    } satisfies AgentEscalationRequest);
    assert.ok(result);
    assert.ok(Object.isFrozen(result));
  });

  it("propagates explicit Agent inputs without implicit choices", () => {
    const customRegistry = Object.freeze({
      profiles: Object.freeze([]),
    }) satisfies AgentRegistry;
    const customRequest = Object.freeze({
      requiredCapabilities: Object.freeze([] as const),
      requiredPermissions: Object.freeze([] as const),
      minEffort: "medium",
      maxEffort: "xhigh",
      budgetCeiling: Object.freeze({
        maxTokens: null,
        maxCostUsd: 10,
        maxDurationMs: 1000,
        maxCalls: 1,
        maxRepairs: 0,
      }),
    }) satisfies AgentSelectionRequest;
    const input = Object.freeze({
      decision: buildDecision("escalate"),
      registry: customRegistry,
      request: customRequest,
      previousProfileId: "agent-x",
      failureReason: "validation_failed",
    }) satisfies CreateAgentEscalationRequestFromRuntimeDecisionInput;

    const result = createAgentEscalationRequestFromRuntimeDecision(input);

    assert.deepEqual(result, {
      registry: customRegistry,
      request: customRequest,
      previousProfileId: "agent-x",
      failureReason: "validation_failed",
    } satisfies AgentEscalationRequest);
  });

  it("keeps runtime failure context available on the original decision and does not mutate inputs", () => {
    const decision = buildDecision("escalate");
    const input = buildInput(decision);

    const result = createAgentEscalationRequestFromRuntimeDecision(input);

    assert.deepEqual(decision, {
      action: "escalate",
      reason: "failure_eligible",
      failureKind: "process_failed",
      runtimeStatus: "non_zero_exit",
    } satisfies LoopRuntimeEscalationDecision);
    assert.deepEqual(input.registry, registry);
    assert.deepEqual(input.request, request);
    assert.deepEqual(result?.registry, registry);
    assert.deepEqual(result?.request, request);
  });

  it("is deterministic across repeated calls", () => {
    const input = buildInput(buildDecision("escalate"));

    const first = createAgentEscalationRequestFromRuntimeDecision(input);
    const second = createAgentEscalationRequestFromRuntimeDecision(input);

    assert.deepEqual(first, second);
  });
});

describe("evaluateLoopRuntimeAgentEscalation", () => {
  const eligiblePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze(["timed_out"] as const),
  });
  const nonEligiblePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze(["timed_out"] as const),
  });

  function buildInput(
    runtimeExecutionResult: Parameters<
      typeof evaluateLoopRuntimeAgentEscalation
    >[0]["runtimeExecutionResult"],
    policy: Parameters<typeof evaluateLoopRuntimeAgentEscalation>[0]["policy"],
    requestValue = escalationRequestWithoutBudgetCeiling,
  ) {
    return Object.freeze({
      runtimeExecutionResult,
      policy,
      registry: escalationRegistry,
      request: requestValue,
      previousProfileId: "agent-low",
      failureReason: "runtime_error",
    }) satisfies Parameters<typeof evaluateLoopRuntimeAgentEscalation>[0];
  }

  it("returns no runtime escalation when execution never started", () => {
    const result = evaluateLoopRuntimeAgentEscalation(
      buildInput(null, eligiblePolicy),
    );

    assert.deepEqual(result, {
      outcome: {
        outcome: "not_started",
        runtimeStatus: null,
      },
      failure: {
        kind: null,
        runtimeStatus: null,
      },
      decision: {
        action: "none",
        reason: "no_failure",
        failureKind: null,
        runtimeStatus: null,
      },
      agentRequest: null,
      agentEscalationResult: null,
    });
  });

  it("short-circuits on success without producing an agent request", () => {
    const result = evaluateLoopRuntimeAgentEscalation(
      buildInput(executedResult("completed"), eligiblePolicy),
    );

    assert.deepEqual(result, {
      outcome: {
        outcome: "succeeded",
        runtimeStatus: "completed",
      },
      failure: {
        kind: null,
        runtimeStatus: "completed",
      },
      decision: {
        action: "none",
        reason: "no_failure",
        failureKind: null,
        runtimeStatus: "completed",
      },
      agentRequest: null,
      agentEscalationResult: null,
    });
  });

  it("short-circuits non-eligible failures before agent escalation", () => {
    const result = evaluateLoopRuntimeAgentEscalation(
      buildInput(executedResult("non_zero_exit"), nonEligiblePolicy),
    );

    assert.deepEqual(result, {
      outcome: {
        outcome: "failed",
        runtimeStatus: "non_zero_exit",
      },
      failure: {
        kind: "process_failed",
        runtimeStatus: "non_zero_exit",
      },
      decision: {
        action: "none",
        reason: "failure_not_eligible",
        failureKind: "process_failed",
        runtimeStatus: "non_zero_exit",
      },
      agentRequest: null,
      agentEscalationResult: null,
    });
  });

  it("performs the pure agent escalation path when the failure is eligible", () => {
    const result = evaluateLoopRuntimeAgentEscalation(
      buildInput(executedResult("timed_out"), eligiblePolicy),
    );

    assert.deepEqual(result, {
      outcome: {
        outcome: "timed_out",
        runtimeStatus: "timed_out",
      },
      failure: {
        kind: "timed_out",
        runtimeStatus: "timed_out",
      },
      decision: {
        action: "escalate",
        reason: "failure_eligible",
        failureKind: "timed_out",
        runtimeStatus: "timed_out",
      },
      agentRequest: {
        registry: escalationRegistry,
        request: escalationRequestWithoutBudgetCeiling,
        previousProfileId: "agent-low",
        failureReason: "runtime_error",
      },
      agentEscalationResult: {
        outcome: "escalated",
        profile: escalationRegistry.profiles[1],
        rejected: [
          {
            profileId: "agent-low",
            reason: "excluded: this is the profile that just failed",
          },
        ],
      },
    });
  });

  it("keeps the agent escalation result exhausted when no next profile exists", () => {
    const exhaustedRegistry = createAgentRegistry([
      {
        id: "agent-only",
        runtime: "custom",
        provider: "local",
        model: "fixture-model",
        effort: "low",
        capabilities: ["code_edit"],
        permissions: [],
        budget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      },
    ]);
    const result = evaluateLoopRuntimeAgentEscalation(
      Object.freeze({
        runtimeExecutionResult: executedResult("timed_out"),
        policy: eligiblePolicy,
        registry: exhaustedRegistry,
        request: escalationRequestWithoutBudgetCeiling,
        previousProfileId: "agent-only",
        failureReason: "runtime_error",
      }) satisfies Parameters<typeof evaluateLoopRuntimeAgentEscalation>[0],
    );

    assert.deepEqual(result.agentRequest, {
      registry: exhaustedRegistry,
      request: escalationRequestWithoutBudgetCeiling,
      previousProfileId: "agent-only",
      failureReason: "runtime_error",
    });
    assert.deepEqual(result.agentEscalationResult, {
      outcome: "exhausted",
      rejected: [
        {
          profileId: "agent-only",
          reason: "excluded: this is the profile that just failed",
        },
      ],
    });
  });

  it("preserves the full five-step composition without mutating inputs", () => {
    const runtimeExecutionResult = executedResult("timed_out");
    const input = buildInput(runtimeExecutionResult, eligiblePolicy);
    const result = evaluateLoopRuntimeAgentEscalation(input);

    assert.deepEqual(
      result.outcome,
      classifyLoopRuntimeExecutionOutcome(runtimeExecutionResult),
    );
    assert.deepEqual(result.failure, classifyLoopRuntimeFailure(result.outcome));
    assert.deepEqual(
      result.decision,
      evaluateLoopRuntimeEscalation(result.failure, eligiblePolicy),
    );
    assert.deepEqual(
      result.agentRequest,
      createAgentEscalationRequestFromRuntimeDecision({
        decision: result.decision,
        registry: escalationRegistry,
        request: escalationRequestWithoutBudgetCeiling,
        previousProfileId: "agent-low",
        failureReason: "runtime_error",
      }),
    );
    assert.deepEqual(
      result.agentEscalationResult,
      evaluateRuntimeAgentEscalation(result.agentRequest),
    );
    assert.deepEqual(input, buildInput(runtimeExecutionResult, eligiblePolicy));
    assert.ok(Object.isFrozen(result));
  });

  it("is deterministic across repeated calls", () => {
    const input = buildInput(executedResult("timed_out"), eligiblePolicy);

    const first = evaluateLoopRuntimeAgentEscalation(input);
    const second = evaluateLoopRuntimeAgentEscalation(input);

    assert.deepEqual(first, second);
  });
});

describe("createAgentEscalationRequestFromRuntimeDecision safety boundary", () => {
  it("does not call the Agent escalation function", () => {
    const source = readFileSync(
      "src/core/loop-runtime-escalation.ts",
      "utf8",
    );

    assert.equal(
      (source.match(/return escalateAgentProfile\(request\);/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(source, /selectAgentProfile\s*\(/);
  });

  it("does not introduce external execution in the composed runtime escalation pipeline", () => {
    const source = readFileSync(
      "src/core/loop-runtime-escalation.ts",
      "utf8",
    );

    assert.equal(
      (source.match(/classifyLoopRuntimeExecutionOutcome\(/g) ?? []).length,
      1,
    );
    assert.equal(
      (source.match(/classifyLoopRuntimeFailure\(/g) ?? []).length,
      1,
    );
    assert.equal(
      (source.match(/evaluateLoopRuntimeEscalation\(/g) ?? []).length,
      1,
    );
    assert.equal(
      (
        source.match(/createAgentEscalationRequestFromRuntimeDecision\(/g) ?? []
      ).length,
      2,
    );
    assert.equal(
      (source.match(/evaluateRuntimeAgentEscalation\(/g) ?? []).length,
      2,
    );
    assert.doesNotMatch(source, /\bspawn\s*\(/);
    assert.doesNotMatch(source, /\bexecFile\s*\(/);
    assert.doesNotMatch(source, /\bexec\s*\(/);
    assert.doesNotMatch(source, /\bfork\s*\(/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /selectAgentProfile\s*\(/);
  });

  it("connects runtime decisions to agent escalation requests only by explicit data plumbing", () => {
    const escalation = createAgentEscalationRequestFromRuntimeDecision(
      Object.freeze({
        decision: Object.freeze({
          action: "escalate",
          reason: "failure_eligible",
          failureKind: "timed_out",
          runtimeStatus: "timed_out",
        }) satisfies LoopRuntimeEscalationDecision,
        registry,
        request,
        previousProfileId: "agent-low",
        failureReason: "runtime_error",
      }) satisfies CreateAgentEscalationRequestFromRuntimeDecisionInput,
    );

    const outcome = classifyLoopRuntimeExecutionOutcome({
      runtimeResult: runtimeResult("timed_out"),
    });
    const failure = classifyLoopRuntimeFailure(outcome);
    const decision = evaluateLoopRuntimeEscalation(failure, {
      eligibleFailureKinds: ["timed_out"],
    });

    assert.equal(decision.action, "escalate");
    assert.ok(escalation);
  });
});

describe("evaluateRuntimeAgentEscalation", () => {
  it("returns null when the request is null", () => {
    assert.equal(evaluateRuntimeAgentEscalation(null), null);
  });

  it("returns the Agent escalation result without transformation", () => {
    const result = evaluateRuntimeAgentEscalation(escalationRequest);

    assert.deepEqual(result, {
      outcome: "escalated",
      profile: escalationRegistry.profiles[1],
      rejected: [
        {
          profileId: "agent-low",
          reason: "excluded: this is the profile that just failed",
        },
      ],
    });
  });

  it("preserves existing Agent rules for exhausted escalation", () => {
    const exhaustedRegistry = createAgentRegistry([
      {
        id: "agent-only",
        runtime: "custom",
        provider: "local",
        model: "fixture-model",
        effort: "low",
        capabilities: ["code_edit"],
        permissions: [],
        budget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      },
    ]);
    const result = evaluateRuntimeAgentEscalation(
      Object.freeze({
        registry: exhaustedRegistry,
        request,
        previousProfileId: "agent-only",
        failureReason: "runtime_error",
      }),
    );

    assert.deepEqual(result, {
      outcome: "exhausted",
      rejected: [
        {
          profileId: "agent-only",
          reason: "excluded: this is the profile that just failed",
        },
      ],
    });
  });

  it("does not mutate escalation inputs", () => {
    const input = Object.freeze(escalationRequest);
    const result = evaluateRuntimeAgentEscalation(input);

    assert.deepEqual(input, escalationRequest);
    assert.deepEqual(result?.rejected[0], {
      profileId: "agent-low",
      reason: "excluded: this is the profile that just failed",
    });
  });

  it("is deterministic across repeated calls", () => {
    const first = evaluateRuntimeAgentEscalation(escalationRequest);
    const second = evaluateRuntimeAgentEscalation(escalationRequest);

    assert.deepEqual(first, second);
  });
});

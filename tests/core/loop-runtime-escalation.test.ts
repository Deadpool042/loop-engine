import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAgentEscalationRequestFromRuntimeDecision,
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  evaluateLoopRuntimeEscalation,
  type CreateAgentEscalationRequestFromRuntimeDecisionInput,
} from "../../src/core/index.js";
import type { AgentEscalationRequest } from "../../src/agents/escalation.js";
import type { AgentRegistry } from "../../src/agents/registry.js";
import type { AgentSelectionRequest } from "../../src/agents/selector.js";
import type { LoopRuntimeEscalationDecision } from "../../src/core/loop-runtime-outcome.js";
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

describe("createAgentEscalationRequestFromRuntimeDecision safety boundary", () => {
  it("does not call the Agent escalation function", () => {
    const source = readFileSync(
      "src/core/loop-runtime-escalation.ts",
      "utf8",
    );

    assert.doesNotMatch(source, /escalateAgentProfile\s*\(/);
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

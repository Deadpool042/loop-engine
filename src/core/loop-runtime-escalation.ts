import type {
  AgentEscalationRequest,
  AgentEscalationResult,
} from "../agents/escalation.js";
import { escalateAgentProfile } from "../agents/escalation.js";
import type { AgentRegistry } from "../agents/registry.js";
import type { AgentSelectionRequest } from "../agents/selector.js";

import type { LoopRuntimeEscalationDecision } from "./loop-runtime-outcome.js";
import type {
  LoopRuntimeExecutionOutcome,
  LoopRuntimeFailure,
  LoopRuntimeEscalationPolicy,
} from "./loop-runtime-outcome.js";
import {
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  evaluateLoopRuntimeEscalation,
} from "./loop-runtime-outcome.js";
import type { PolicyBoundLocalProcessExecutionResult } from "./runtime-execution-bridge.js";

export type LoopRuntimeAgentEscalationResult = Readonly<{
  outcome: LoopRuntimeExecutionOutcome;
  failure: LoopRuntimeFailure;
  decision: LoopRuntimeEscalationDecision;
  agentRequest: AgentEscalationRequest | null;
  agentEscalationResult: AgentEscalationResult | null;
}>;

export type EvaluateLoopRuntimeAgentEscalationInput = Readonly<{
  runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult | null | undefined;
  policy: LoopRuntimeEscalationPolicy;
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  failureReason: AgentEscalationRequest["failureReason"];
}>;

export type EvaluatePolicyBoundRuntimeExecutionEscalationInput = Readonly<{
  runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult | null | undefined;
  policy: LoopRuntimeEscalationPolicy;
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  failureReason: AgentEscalationRequest["failureReason"];
}>;

export type CreateAgentEscalationRequestFromRuntimeDecisionInput = Readonly<{
  decision: LoopRuntimeEscalationDecision;
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  failureReason: AgentEscalationRequest["failureReason"];
}>;

export function createAgentEscalationRequestFromRuntimeDecision(
  input: CreateAgentEscalationRequestFromRuntimeDecisionInput,
): AgentEscalationRequest | null {
  if (input.decision.action !== "escalate") {
    return null;
  }

  return Object.freeze({
    registry: input.registry,
    request: input.request,
    previousProfileId: input.previousProfileId,
    failureReason: input.failureReason,
  });
}

export function evaluateRuntimeAgentEscalation(
  request: AgentEscalationRequest | null,
): AgentEscalationResult | null {
  if (request === null) {
    return null;
  }

  return escalateAgentProfile(request);
}

export function evaluateLoopRuntimeAgentEscalation(
  input: EvaluateLoopRuntimeAgentEscalationInput,
): LoopRuntimeAgentEscalationResult {
  const outcome = classifyLoopRuntimeExecutionOutcome(
    input.runtimeExecutionResult,
  );
  const failure = classifyLoopRuntimeFailure(outcome);
  const decision = evaluateLoopRuntimeEscalation(failure, input.policy);
  const agentRequest = createAgentEscalationRequestFromRuntimeDecision({
    decision,
    registry: input.registry,
    request: input.request,
    previousProfileId: input.previousProfileId,
    failureReason: input.failureReason,
  });
  const agentEscalationResult = evaluateRuntimeAgentEscalation(agentRequest);

  return Object.freeze({
    outcome,
    failure,
    decision,
    agentRequest,
    agentEscalationResult,
  });
}

export function evaluatePolicyBoundRuntimeExecutionEscalation(
  input: EvaluatePolicyBoundRuntimeExecutionEscalationInput,
): LoopRuntimeAgentEscalationResult {
  return evaluateLoopRuntimeAgentEscalation({
    runtimeExecutionResult: input.runtimeExecutionResult,
    policy: input.policy,
    registry: input.registry,
    request: input.request,
    previousProfileId: input.previousProfileId,
    failureReason: input.failureReason,
  });
}

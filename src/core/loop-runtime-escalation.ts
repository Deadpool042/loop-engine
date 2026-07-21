import type {
  AgentEscalationRequest,
  AgentEscalationResult,
} from "../agents/escalation.js";
import { escalateAgentProfile } from "../agents/escalation.js";
import type { AgentRegistry } from "../agents/registry.js";
import type { AgentSelectionRequest } from "../agents/selector.js";

import type { LoopRuntimeEscalationDecision } from "./loop-runtime-outcome.js";

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

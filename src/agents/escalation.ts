import type { AgentRegistry } from "./registry.js";
import {
  evaluateAgentProfile,
  pickSmallestCapable,
  type AgentRejection,
  type AgentSelectionRequest,
} from "./selector.js";
import { compareAgentEffort, type AgentProfile } from "./types.js";

export const AGENT_FAILURE_REASONS = [
  "budget_exceeded",
  "capability_gap",
  "runtime_error",
  "validation_failed",
] as const;

export type AgentFailureReason = (typeof AGENT_FAILURE_REASONS)[number];

export function isAgentFailureReasonModelEscalationEligible(
  reason: AgentFailureReason,
): boolean {
  return reason === "capability_gap" || reason === "validation_failed";
}

export type AgentEscalationRequest = Readonly<{
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  // Structured trigger. Only capability/validation failures justify
  // increasing the model/profile inside the same provider/runtime. Runtime
  // and budget failures belong to failover or an explicit stop decision.
  failureReason: AgentFailureReason;
}>;

export type AgentEscalationResult =
  | Readonly<{
      outcome: "escalated";
      profile: AgentProfile;
      rejected: readonly AgentRejection[];
    }>
  | Readonly<{ outcome: "exhausted"; rejected: readonly AgentRejection[] }>;

// Never invoked implicitly: escalation only happens when a caller supplies
// a real previousProfileId and failureReason. There is no automatic retry
// or background escalation anywhere in this module.
export function escalateAgentProfile(
  input: AgentEscalationRequest,
): AgentEscalationResult {
  const previousProfile = input.registry.profiles.find(
    (profile) => profile.id === input.previousProfileId,
  );

  if (!previousProfile) {
    throw new Error(
      `Unknown previous agent profile: ${input.previousProfileId}`,
    );
  }

  const rejected: AgentRejection[] = [];
  const eligible: AgentProfile[] = [];

  if (!isAgentFailureReasonModelEscalationEligible(input.failureReason)) {
    return {
      outcome: "exhausted",
      rejected: input.registry.profiles.map((profile) => ({
        profileId: profile.id,
        reason: `failure ${input.failureReason} does not justify intra-provider model escalation`,
      })),
    };
  }

  for (const profile of input.registry.profiles) {
    if (profile.id === previousProfile.id) {
      rejected.push({
        profileId: profile.id,
        reason: "excluded: this is the profile that just failed",
      });
      continue;
    }

    if (
      profile.provider !== previousProfile.provider ||
      profile.runtime !== previousProfile.runtime
    ) {
      rejected.push({
        profileId: profile.id,
        reason: "provider/runtime differs from the failed profile",
      });
      continue;
    }

    if (compareAgentEffort(profile.effort, previousProfile.effort) <= 0) {
      rejected.push({
        profileId: profile.id,
        reason: `effort ${profile.effort} does not exceed failed profile's effort ${previousProfile.effort}`,
      });
      continue;
    }

    const evaluation = evaluateAgentProfile(profile, input.request);

    if (evaluation.ok) {
      eligible.push(profile);
    } else {
      rejected.push({ profileId: profile.id, reason: evaluation.reason });
    }
  }

  const selected = pickSmallestCapable(eligible);

  if (!selected) {
    return { outcome: "exhausted", rejected };
  }

  return { outcome: "escalated", profile: selected, rejected };
}

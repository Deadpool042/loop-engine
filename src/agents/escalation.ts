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

export type AgentEscalationRequest = Readonly<{
  registry: AgentRegistry;
  request: AgentSelectionRequest;
  previousProfileId: string;
  // Captured for explainability and for a future LoopExecutor journal.
  // The historical Agent escalation contract does not branch on the reason:
  // every explicit failure escalates by effort. V48.5 model-tier escalation
  // is a separate concern in src/loop/model-escalation.ts.
  failureReason: AgentFailureReason;
}>;

export type AgentEscalationResult =
  | Readonly<{
      outcome: "escalated";
      profile: AgentProfile;
      rejected: readonly AgentRejection[];
    }>
  | Readonly<{ outcome: "exhausted"; rejected: readonly AgentRejection[] }>;

// Historical V7/V13 contract. Never invoked implicitly: escalation only
// happens when a caller supplies a real previousProfileId and failureReason.
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

  for (const profile of input.registry.profiles) {
    if (profile.id === previousProfile.id) {
      rejected.push({
        profileId: profile.id,
        reason: "excluded: this is the profile that just failed",
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

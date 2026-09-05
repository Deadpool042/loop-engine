import type { AgentRegistry } from "../agents/registry.js";
import {
  evaluateAgentProfile,
  pickSmallestCapable,
} from "../agents/selector.js";
import {
  agentEconomicTierRank,
  compareAgentEffort,
  type AgentProfile,
} from "../agents/types.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import type { LoopExecutionPlan } from "./execution-plan.js";

export const LOOP_MODEL_ESCALATION_SCHEMA_VERSION = 1 as const;
export const LOOP_MODEL_ESCALATION_MAX_ATTEMPTS = 2 as const;

export const LOOP_MODEL_ESCALATION_TRIGGERS = [
  "provider_max_turns",
  "validation_failed",
] as const;

export type LoopModelEscalationTrigger =
  (typeof LOOP_MODEL_ESCALATION_TRIGGERS)[number];

export type LoopModelEscalationAttemptEvidence = Readonly<{
  attempt: number;
  trigger: LoopModelEscalationTrigger;
  provider: string;
  runtime: string;
  fromProfileId: string;
  fromModel: string;
  toProfileId: string;
  toModel: string;
}>;

export type LoopModelEscalationEvidence = Readonly<{
  schemaVersion: typeof LOOP_MODEL_ESCALATION_SCHEMA_VERSION;
  maxAttempts: number;
  attempts: readonly LoopModelEscalationAttemptEvidence[];
}>;

export type LoopModelEscalationDecision =
  | Readonly<{
      outcome: "escalated";
      profile: AgentProfile;
      resolution: AgentPolicyResolution;
      evidence: LoopModelEscalationAttemptEvidence;
    }>
  | Readonly<{
      outcome: "not_applicable";
      reason:
        | "policy_disabled"
        | "attempt_budget_exhausted"
        | "failure_not_model_related"
        | "resolution_not_selected"
        | "no_higher_profile";
    }>;

function isSupportedTrigger(value: string): value is LoopModelEscalationTrigger {
  return LOOP_MODEL_ESCALATION_TRIGGERS.includes(
    value as LoopModelEscalationTrigger,
  );
}

export function resolveModelAttemptBudget(
  resolution: AgentPolicyResolution,
  allowEscalation: boolean,
): number {
  if (!allowEscalation) return 1;

  const configured = resolution.selectionRequest.budgetCeiling?.maxCalls;
  if (
    typeof configured !== "number" ||
    !Number.isInteger(configured) ||
    configured <= 1
  ) {
    return 1;
  }

  return Math.min(configured, LOOP_MODEL_ESCALATION_MAX_ATTEMPTS);
}

function isStrictlyHigherProfile(
  current: AgentProfile,
  candidate: AgentProfile,
): boolean {
  if (candidate.model === current.model) return false;

  if (current.economicTier !== undefined) {
    if (candidate.economicTier === undefined) return false;
    return (
      agentEconomicTierRank(candidate.economicTier) >
      agentEconomicTierRank(current.economicTier)
    );
  }

  if (candidate.economicTier !== undefined) {
    return compareAgentEffort(candidate.effort, current.effort) > 0;
  }

  return compareAgentEffort(candidate.effort, current.effort) > 0;
}

function replaceSelectedProfile(
  resolution: AgentPolicyResolution,
  profile: AgentProfile,
  trigger: LoopModelEscalationTrigger,
  previousProfileId: string,
): AgentPolicyResolution {
  if (resolution.selection?.outcome !== "selected") {
    return resolution;
  }

  return Object.freeze({
    ...resolution,
    selection: Object.freeze({
      outcome: "selected" as const,
      profile,
      rejected: Object.freeze([...resolution.selection.rejected]),
      ...(resolution.selection.notSelected === undefined
        ? {}
        : {
            notSelected: Object.freeze([
              ...resolution.selection.notSelected,
            ]),
          }),
    }),
    reasons: Object.freeze([
      ...resolution.reasons,
      `intra-provider escalation after ${trigger}: ${previousProfileId} -> ${profile.id}`,
    ]),
  });
}

export function resolveIntraProviderModelEscalation(input: Readonly<{
  registry: AgentRegistry;
  resolution: AgentPolicyResolution;
  currentPlan: LoopExecutionPlan;
  allowEscalation: boolean;
  completedAttempts: number;
  maxAttempts: number;
  failureCode: string;
}>): LoopModelEscalationDecision {
  if (!input.allowEscalation) {
    return Object.freeze({
      outcome: "not_applicable" as const,
      reason: "policy_disabled" as const,
    });
  }

  if (input.completedAttempts >= input.maxAttempts) {
    return Object.freeze({
      outcome: "not_applicable" as const,
      reason: "attempt_budget_exhausted" as const,
    });
  }

  if (!isSupportedTrigger(input.failureCode)) {
    return Object.freeze({
      outcome: "not_applicable" as const,
      reason: "failure_not_model_related" as const,
    });
  }

  if (input.resolution.selection?.outcome !== "selected") {
    return Object.freeze({
      outcome: "not_applicable" as const,
      reason: "resolution_not_selected" as const,
    });
  }

  const current =
    input.registry.profiles.find(
      (profile) =>
        profile.id === input.currentPlan.profileId &&
        profile.provider === input.currentPlan.provider &&
        profile.runtime === input.currentPlan.runtime &&
        profile.model === input.currentPlan.model,
    ) ?? input.resolution.selection.profile;

  const eligible: AgentProfile[] = [];
  for (const profile of input.registry.profiles) {
    if (
      profile.id === current.id ||
      profile.provider !== current.provider ||
      profile.runtime !== current.runtime ||
      !isStrictlyHigherProfile(current, profile)
    ) {
      continue;
    }

    const evaluation = evaluateAgentProfile(profile, {
      ...input.resolution.selectionRequest,
      allowedProviders: [current.provider],
      allowedRuntimes: [current.runtime],
    });
    if (evaluation.ok) eligible.push(profile);
  }

  const selected = pickSmallestCapable(eligible);
  if (!selected) {
    return Object.freeze({
      outcome: "not_applicable" as const,
      reason: "no_higher_profile" as const,
    });
  }

  const trigger = input.failureCode as LoopModelEscalationTrigger;
  return Object.freeze({
    outcome: "escalated" as const,
    profile: selected,
    resolution: replaceSelectedProfile(
      input.resolution,
      selected,
      trigger,
      current.id,
    ),
    evidence: Object.freeze({
      attempt: input.completedAttempts + 1,
      trigger,
      provider: current.provider,
      runtime: current.runtime,
      fromProfileId: current.id,
      fromModel: current.model,
      toProfileId: selected.id,
      toModel: selected.model,
    }),
  });
}

export function createModelEscalationEvidence(
  maxAttempts: number,
  attempts: readonly LoopModelEscalationAttemptEvidence[],
): LoopModelEscalationEvidence {
  return Object.freeze({
    schemaVersion: LOOP_MODEL_ESCALATION_SCHEMA_VERSION,
    maxAttempts,
    attempts: Object.freeze([...attempts]),
  });
}

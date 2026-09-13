import { createAgentRegistry } from "./registry.js";
import {
  rankAgentProfilesByEfficiency,
  selectAgentProfile,
  type AgentEfficiencySignal,
  type AgentSelectionRequest,
} from "./selector.js";
import type {
  AgentEffort,
  AgentProfile,
  AgentProvider,
  AgentRuntime,
} from "./types.js";

export type AgentRouteCandidate = Readonly<{
  profile: AgentProfile;
  executionPath: string;
  executableNow: boolean;
  bindingReason?: string;
}>;

export type AgentRouteSelectionBasis =
  | "measured_efficiency"
  | "smallest_capable";

export type AgentRouteNotSelectedReason =
  | "binding_unavailable"
  | "hard_gate"
  | "frontier_not_required"
  | "efficiency_unknown"
  | "invalid_efficiency_signal"
  | "lower_efficiency"
  | "lower_preference";

export type AgentRouteNotSelected = Readonly<{
  profileId: string;
  runtime: AgentRuntime;
  provider: AgentProvider;
  model: string;
  executionPath: string;
  reason: AgentRouteNotSelectedReason;
  detail: string;
}>;

export type AgentRouteSelected = Readonly<{
  profileId: string;
  runtime: AgentRuntime;
  provider: AgentProvider;
  model: string;
  effort: AgentEffort;
  executionPath: string;
  basis: AgentRouteSelectionBasis;
  efficiencyScore: number | null;
  quotaWindowLabel: string | null;
  expectedValuePercent: number | null;
  expectedQuotaConsumedPercent: number | null;
  sampleSize: number | null;
}>;

export type AgentRouteDecision =
  | Readonly<{
      outcome: "selected";
      selected: AgentRouteSelected;
      notSelected: readonly AgentRouteNotSelected[];
    }>
  | Readonly<{
      outcome: "no_match";
      selected: null;
      notSelected: readonly AgentRouteNotSelected[];
    }>;

export type DecideAgentRouteInput = Readonly<{
  candidates: readonly AgentRouteCandidate[];
  request: AgentSelectionRequest;
  effort: AgentEffort;
  efficiencySignals: readonly AgentEfficiencySignal[];
}>;

function evidence(
  candidate: AgentRouteCandidate,
  reason: AgentRouteNotSelectedReason,
  detail: string,
): AgentRouteNotSelected {
  return Object.freeze({
    profileId: candidate.profile.id,
    runtime: candidate.profile.runtime,
    provider: candidate.profile.provider,
    model: candidate.profile.model,
    executionPath: candidate.executionPath,
    reason,
    detail,
  });
}

function candidateById(
  candidates: readonly AgentRouteCandidate[],
): ReadonlyMap<string, AgentRouteCandidate> {
  const map = new Map<string, AgentRouteCandidate>();
  for (const candidate of candidates) {
    if (map.has(candidate.profile.id)) {
      throw new TypeError(`Duplicate AUTO route candidate id: ${candidate.profile.id}`);
    }
    map.set(candidate.profile.id, candidate);
  }
  return map;
}

function sortEvidence(
  values: readonly AgentRouteNotSelected[],
): readonly AgentRouteNotSelected[] {
  return Object.freeze(
    [...values].sort((left, right) =>
      left.profileId.localeCompare(right.profileId),
    ),
  );
}

export function decideAgentRoute(input: DecideAgentRouteInput): AgentRouteDecision {
  const byId = candidateById(input.candidates);
  const executable = input.candidates.filter((candidate) => candidate.executableNow);
  const notSelected: AgentRouteNotSelected[] = input.candidates
    .filter((candidate) => !candidate.executableNow)
    .map((candidate) =>
      evidence(
        candidate,
        "binding_unavailable",
        candidate.bindingReason ?? "execution binding is not available",
      ),
    );

  if (executable.length === 0) {
    return Object.freeze({
      outcome: "no_match" as const,
      selected: null,
      notSelected: sortEvidence(notSelected),
    });
  }

  const registry = createAgentRegistry(executable.map((candidate) => candidate.profile));
  const efficiency = rankAgentProfilesByEfficiency(
    registry,
    input.request,
    input.efficiencySignals,
  );

  for (const rejected of efficiency.rejected) {
    const candidate = byId.get(rejected.profileId)!;
    notSelected.push(evidence(candidate, "hard_gate", rejected.reason));
  }

  if (efficiency.ranked.length > 0) {
    const winner = efficiency.ranked[0]!;
    const selectedCandidate = byId.get(winner.profileId)!;

    for (const lower of efficiency.ranked.slice(1)) {
      const candidate = byId.get(lower.profileId)!;
      notSelected.push(
        evidence(
          candidate,
          "lower_efficiency",
          `efficiency ${lower.score} is below selected ${winner.score}`,
        ),
      );
    }
    for (const unranked of efficiency.unranked) {
      const candidate = byId.get(unranked.profileId)!;
      notSelected.push(
        evidence(
          candidate,
          unranked.reason,
          unranked.reason === "frontier_not_required"
            ? "frontier tier is not required while a lower known tier is capable"
            : unranked.reason === "invalid_efficiency_signal"
              ? "efficiency evidence is invalid"
              : "efficiency evidence is unavailable",
        ),
      );
    }

    return Object.freeze({
      outcome: "selected" as const,
      selected: Object.freeze({
        profileId: selectedCandidate.profile.id,
        runtime: selectedCandidate.profile.runtime,
        provider: selectedCandidate.profile.provider,
        model: selectedCandidate.profile.model,
        effort: input.effort,
        executionPath: selectedCandidate.executionPath,
        basis: "measured_efficiency" as const,
        efficiencyScore: winner.score,
        quotaWindowLabel: winner.quotaWindowLabel,
        expectedValuePercent: winner.expectedValuePercent,
        expectedQuotaConsumedPercent: winner.expectedQuotaConsumedPercent,
        sampleSize: winner.sampleSize,
      }),
      notSelected: sortEvidence(notSelected),
    });
  }

  const fallback = selectAgentProfile(registry, input.request);
  if (fallback.outcome === "no_match") {
    for (const rejected of fallback.rejected) {
      if (notSelected.some((item) => item.profileId === rejected.profileId)) continue;
      const candidate = byId.get(rejected.profileId)!;
      notSelected.push(evidence(candidate, "hard_gate", rejected.reason));
    }
    return Object.freeze({
      outcome: "no_match" as const,
      selected: null,
      notSelected: sortEvidence(notSelected),
    });
  }

  const selectedCandidate = byId.get(fallback.profile.id)!;
  for (const alternative of fallback.notSelected ?? []) {
    const candidate = byId.get(alternative.profileId)!;
    notSelected.push(
      evidence(
        candidate,
        alternative.reason === "frontier_not_required"
          ? "frontier_not_required"
          : "lower_preference",
        alternative.reason,
      ),
    );
  }

  return Object.freeze({
    outcome: "selected" as const,
    selected: Object.freeze({
      profileId: selectedCandidate.profile.id,
      runtime: selectedCandidate.profile.runtime,
      provider: selectedCandidate.profile.provider,
      model: selectedCandidate.profile.model,
      effort: input.effort,
      executionPath: selectedCandidate.executionPath,
      basis: "smallest_capable" as const,
      efficiencyScore: null,
      quotaWindowLabel: null,
      expectedValuePercent: null,
      expectedQuotaConsumedPercent: null,
      sampleSize: null,
    }),
    notSelected: sortEvidence(notSelected),
  });
}

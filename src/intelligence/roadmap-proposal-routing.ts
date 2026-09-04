import type { AnthropicEffort } from "../text-only-provider/index.js";
import {
  ANTHROPIC_HAIKU_4_5_MODEL,
  ANTHROPIC_SONNET_5_MODEL,
} from "../text-only-provider/pricing.js";
import type { RoadmapProposalContextReport } from "../core/reports.js";

/**
 * Closed set of cost/effort profiles for the roadmap proposal call. The GUI never
 * chooses a model or effort value directly — it only ever displays one of these.
 */
export const ROADMAP_PROPOSAL_PROFILES = [
  "economy",
  "balanced",
  "deep",
] as const;
export type RoadmapProposalProfile = (typeof ROADMAP_PROPOSAL_PROFILES)[number];

export type RoadmapProposalRouting = Readonly<{
  profile: RoadmapProposalProfile;
  model: string;
  effort: AnthropicEffort | null;
  reason: string;
}>;

/**
 * Fixed model/effort per profile. Haiku 4.5 does not support the `effort` API
 * parameter (it errors), so `economy` never sets one.
 */
const PROFILE_CONFIG: Readonly<
  Record<
    RoadmapProposalProfile,
    Readonly<{ model: string; effort: AnthropicEffort | null }>
  >
> = Object.freeze({
  economy: Object.freeze({ model: ANTHROPIC_HAIKU_4_5_MODEL, effort: null }),
  balanced: Object.freeze({ model: ANTHROPIC_SONNET_5_MODEL, effort: "low" as const }),
  deep: Object.freeze({ model: ANTHROPIC_SONNET_5_MODEL, effort: "medium" as const }),
});

const HIGH_COMPLEXITY_BLOCKED_THRESHOLD = 3;
const HIGH_COMPLEXITY_OPEN_WORK_THRESHOLD = 15;

function routing(
  profile: RoadmapProposalProfile,
  reason: string,
): RoadmapProposalRouting {
  return Object.freeze({
    profile,
    model: PROFILE_CONFIG[profile].model,
    effort: PROFILE_CONFIG[profile].effort,
    reason,
  });
}

/** Resolves one operator-selectable profile to its fixed model/effort pair. */
export function resolveRoadmapProposalProfile(
  profile: RoadmapProposalProfile,
): RoadmapProposalRouting {
  return routing(profile, "operator_override");
}

/**
 * Deterministic, provider-free profile selection. Never calls the provider and
 * never inspects anything beyond the already-bounded proposal context report.
 */
export function selectRoadmapProposalProfile(
  context: RoadmapProposalContextReport,
): RoadmapProposalRouting {
  if (context.context !== "available") {
    return routing("economy", "context_unavailable");
  }

  const { stats, candidates, phaseGates } = context.roadmap;
  const objectiveTruncated =
    "sourceTruncated" in context.objective
      ? Boolean(context.objective.sourceTruncated)
      : false;
  const truncated =
    context.roadmap.configuredPathsTruncated ||
    candidates.truncated ||
    phaseGates.truncated ||
    objectiveTruncated;
  const openWork = stats.todo + stats.inProgress;
  const activeBlocked = candidates.items.filter(
    (candidate) => candidate.kind === "blocked",
  ).length;

  if (truncated) {
    return routing("deep", "context_truncated");
  }
  if (activeBlocked >= HIGH_COMPLEXITY_BLOCKED_THRESHOLD) {
    return routing("deep", "multiple_blocked_candidates");
  }
  if (openWork > HIGH_COMPLEXITY_OPEN_WORK_THRESHOLD) {
    return routing("deep", "large_open_backlog");
  }
  if (candidates.total === 0) {
    return routing("economy", "roadmap_complete_no_signal");
  }
  return routing("balanced", "bounded_open_work");
}

import type { AnthropicEffort } from "../text-only-provider/index.js";
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
  economy: Object.freeze({ model: "claude-haiku-4-5", effort: null }),
  balanced: Object.freeze({ model: "claude-sonnet-5", effort: "low" as const }),
  deep: Object.freeze({ model: "claude-sonnet-5", effort: "medium" as const }),
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

  if (truncated) {
    return routing("deep", "context_truncated");
  }
  if (stats.blocked >= HIGH_COMPLEXITY_BLOCKED_THRESHOLD) {
    return routing("deep", "multiple_blocked_candidates");
  }
  if (openWork > HIGH_COMPLEXITY_OPEN_WORK_THRESHOLD) {
    return routing("deep", "large_open_backlog");
  }
  if (openWork === 0 && stats.blocked === 0) {
    return routing("economy", "roadmap_complete_no_signal");
  }
  return routing("balanced", "bounded_open_work");
}

import type {
  RoadmapProposalProfile,
  AnthropicEffort,
} from "./roadmap-proposal-contract.js";

export type RoadmapProposalEstimateReport = Readonly<{
  schemaVersion: 1;
  project: Readonly<{ name: string }>;
  estimate:
    | Readonly<{ status: "unavailable"; reason: string }>
    | Readonly<{
        status: "available";
        profile: RoadmapProposalProfile;
        model: string;
        effort: AnthropicEffort | null;
        reason: string;
        estimatedInputTokens: number;
        estimatedOutputTokens: number;
        estimatedCostUsd?: number;
        pricingEffectiveDate?: string;
      }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ANTHROPIC_EFFORT_VALUES: readonly AnthropicEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function isEffort(value: unknown): value is AnthropicEffort {
  return (
    typeof value === "string" &&
    (ANTHROPIC_EFFORT_VALUES as readonly string[]).includes(value)
  );
}

function isProfile(value: unknown): value is RoadmapProposalProfile {
  return value === "economy" || value === "balanced" || value === "deep";
}

export function parseRoadmapProposalEstimateReport(
  value: unknown,
): RoadmapProposalEstimateReport | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isRecord(value.project) || typeof value.project.name !== "string")
    return null;
  if (!isRecord(value.estimate)) return null;

  const { estimate } = value;
  if (estimate.status === "unavailable") {
    if (typeof estimate.reason !== "string") return null;
    return Object.freeze({
      schemaVersion: 1 as const,
      project: Object.freeze({ name: value.project.name }),
      estimate: Object.freeze({
        status: "unavailable" as const,
        reason: estimate.reason,
      }),
    });
  }

  if (
    estimate.status !== "available" ||
    !isProfile(estimate.profile) ||
    typeof estimate.model !== "string" ||
    (estimate.effort !== null && !isEffort(estimate.effort)) ||
    typeof estimate.reason !== "string" ||
    typeof estimate.estimatedInputTokens !== "number" ||
    typeof estimate.estimatedOutputTokens !== "number"
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    project: Object.freeze({ name: value.project.name }),
    estimate: Object.freeze({
      status: "available" as const,
      profile: estimate.profile,
      model: estimate.model,
      effort: estimate.effort,
      reason: estimate.reason,
      estimatedInputTokens: estimate.estimatedInputTokens,
      estimatedOutputTokens: estimate.estimatedOutputTokens,
      ...(typeof estimate.estimatedCostUsd === "number"
        ? { estimatedCostUsd: estimate.estimatedCostUsd }
        : {}),
      ...(typeof estimate.pricingEffectiveDate === "string"
        ? { pricingEffectiveDate: estimate.pricingEffectiveDate }
        : {}),
    }),
  });
}

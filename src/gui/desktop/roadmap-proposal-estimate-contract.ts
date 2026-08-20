import type {
  RoadmapProposalProfile,
  AnthropicEffort,
} from "./roadmap-proposal-contract.js";
import { resolveRoadmapProposalProfile } from "../../intelligence/roadmap-proposal-routing.js";

export type RoadmapProposalEstimateOption = Readonly<{
  profile: RoadmapProposalProfile;
  model: string;
  effort: AnthropicEffort | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd?: number;
  pricingEffectiveDate?: string;
}>;

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
        options: readonly RoadmapProposalEstimateOption[];
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

function parseOption(value: unknown): RoadmapProposalEstimateOption | null {
  if (
    !isRecord(value) ||
    !isProfile(value.profile) ||
    typeof value.model !== "string" ||
    (value.effort !== null && !isEffort(value.effort)) ||
    typeof value.estimatedInputTokens !== "number" ||
    typeof value.estimatedOutputTokens !== "number"
  ) {
    return null;
  }

  const canonical = resolveRoadmapProposalProfile(value.profile);
  if (value.model !== canonical.model || value.effort !== canonical.effort) {
    return null;
  }

  return Object.freeze({
    profile: value.profile,
    model: value.model,
    effort: value.effort,
    estimatedInputTokens: value.estimatedInputTokens,
    estimatedOutputTokens: value.estimatedOutputTokens,
    ...(typeof value.estimatedCostUsd === "number"
      ? { estimatedCostUsd: value.estimatedCostUsd }
      : {}),
    ...(typeof value.pricingEffectiveDate === "string"
      ? { pricingEffectiveDate: value.pricingEffectiveDate }
      : {}),
  });
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
    typeof estimate.estimatedOutputTokens !== "number" ||
    !Array.isArray(estimate.options)
  ) {
    return null;
  }

  const options = estimate.options.map(parseOption);
  if (
    options.some((option) => option === null) ||
    options.length !== 3 ||
    new Set(options.map((option) => option!.profile)).size !== 3 ||
    !options.some((option) => option!.profile === estimate.profile)
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
      options: Object.freeze(options as RoadmapProposalEstimateOption[]),
    }),
  });
}

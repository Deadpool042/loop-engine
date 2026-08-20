export type RoadmapProposalLot = Readonly<{
  title: string;
  objective: string;
  benefit: string;
  cost: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  dependencies: readonly string[];
}>;

export type RoadmapProposalAssessment = Readonly<{
  observedGaps: readonly string[];
  assumptions: readonly string[];
}>;

export type RoadmapProposal =
  | Readonly<{ status: "no_proposal"; reason: string }>
  | Readonly<{
      status: "proposed";
      summary: string;
      lots: readonly RoadmapProposalLot[];
    }>;

export type RoadmapProposalProfile = "economy" | "balanced" | "deep";
export type RoadmapProposalProfileOverride = "auto" | RoadmapProposalProfile;
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type RoadmapProposalUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export type RoadmapProposalReport = Readonly<{
  schemaVersion: 1;
  project: Readonly<{ name: string }>;
  result:
    | Readonly<{ status: "unavailable"; reason: string }>
    | Readonly<{
        status: "failed";
        reason: string;
        /** Only present when a provider call completed but failed local business validation. */
        validationFailureCode?: string;
        provider?: string;
        model?: string;
        effort?: AnthropicEffort | null;
        durationMs?: number;
        usage?: RoadmapProposalUsage;
        actualCalculatedCostUsd?: number;
        pricingEffectiveDate?: string;
      }>
    | Readonly<{
        status: "completed";
        provider: string;
        model: string;
        effort: AnthropicEffort | null;
        durationMs: number;
        usage?: RoadmapProposalUsage;
        actualCalculatedCostUsd?: number;
        pricingEffectiveDate?: string;
        normalizationWarnings?: readonly string[];
      }>;
  profile?: RoadmapProposalProfile;
  assessment?: RoadmapProposalAssessment;
  proposal?: RoadmapProposal;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isCostRisk(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

function isLot(value: unknown): value is RoadmapProposalLot {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.objective === "string" &&
    typeof value.benefit === "string" &&
    isCostRisk(value.cost) &&
    isCostRisk(value.risk) &&
    isStringArray(value.dependencies)
  );
}

function parseAssessment(
  value: unknown,
): RoadmapProposalAssessment | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !isStringArray(value.observedGaps) ||
    !isStringArray(value.assumptions)
  ) {
    return undefined;
  }
  return Object.freeze({
    observedGaps: Object.freeze([...value.observedGaps]),
    assumptions: Object.freeze([...value.assumptions]),
  });
}

function parseProposal(value: unknown): RoadmapProposal | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;

  if (value.status === "no_proposal") {
    if (typeof value.reason !== "string") return undefined;
    return Object.freeze({
      status: "no_proposal" as const,
      reason: value.reason,
    });
  }

  if (value.status === "proposed") {
    if (
      typeof value.summary !== "string" ||
      !Array.isArray(value.lots) ||
      !value.lots.every(isLot)
    ) {
      return undefined;
    }
    return Object.freeze({
      status: "proposed" as const,
      summary: value.summary,
      lots: Object.freeze(
        value.lots.map((lot) =>
          Object.freeze({
            title: lot.title,
            objective: lot.objective,
            benefit: lot.benefit,
            cost: lot.cost,
            risk: lot.risk,
            dependencies: Object.freeze([...lot.dependencies]),
          }),
        ),
      ),
    });
  }

  return undefined;
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

function parseUsage(value: unknown): RoadmapProposalUsage | undefined {
  if (
    !isRecord(value) ||
    typeof value.inputTokens !== "number" ||
    typeof value.outputTokens !== "number"
  ) {
    return undefined;
  }
  return Object.freeze({
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
  });
}

function parseResult(
  value: unknown,
): RoadmapProposalReport["result"] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === "unavailable") {
    if (typeof value.reason !== "string") return undefined;
    return Object.freeze({ status: "unavailable" as const, reason: value.reason });
  }
  if (value.status === "failed") {
    if (typeof value.reason !== "string") return undefined;
    const usage = parseUsage(value.usage);
    return Object.freeze({
      status: "failed" as const,
      reason: value.reason,
      ...(typeof value.validationFailureCode === "string"
        ? { validationFailureCode: value.validationFailureCode }
        : {}),
      ...(typeof value.provider === "string" ? { provider: value.provider } : {}),
      ...(typeof value.model === "string" ? { model: value.model } : {}),
      ...(value.effort === null
        ? { effort: null }
        : isEffort(value.effort)
          ? { effort: value.effort }
          : {}),
      ...(typeof value.durationMs === "number"
        ? { durationMs: value.durationMs }
        : {}),
      ...(usage === undefined ? {} : { usage }),
      ...(typeof value.actualCalculatedCostUsd === "number"
        ? { actualCalculatedCostUsd: value.actualCalculatedCostUsd }
        : {}),
      ...(typeof value.pricingEffectiveDate === "string"
        ? { pricingEffectiveDate: value.pricingEffectiveDate }
        : {}),
    });
  }
  if (value.status === "completed") {
    if (
      typeof value.provider !== "string" ||
      typeof value.model !== "string" ||
      typeof value.durationMs !== "number" ||
      (value.effort !== null &&
        value.effort !== undefined &&
        !isEffort(value.effort))
    ) {
      return undefined;
    }
    const usage = parseUsage(value.usage);
    const normalizationWarnings = isStringArray(value.normalizationWarnings)
      ? Object.freeze([...value.normalizationWarnings])
      : undefined;
    return Object.freeze({
      status: "completed" as const,
      provider: value.provider,
      model: value.model,
      effort: isEffort(value.effort) ? value.effort : null,
      durationMs: value.durationMs,
      ...(usage === undefined ? {} : { usage }),
      ...(typeof value.actualCalculatedCostUsd === "number"
        ? { actualCalculatedCostUsd: value.actualCalculatedCostUsd }
        : {}),
      ...(typeof value.pricingEffectiveDate === "string"
        ? { pricingEffectiveDate: value.pricingEffectiveDate }
        : {}),
      ...(normalizationWarnings === undefined
        ? {}
        : { normalizationWarnings }),
    });
  }
  return undefined;
}

export function parseRoadmapProposalReport(
  value: unknown,
): RoadmapProposalReport | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isRecord(value.project) || typeof value.project.name !== "string")
    return null;

  const result = parseResult(value.result);
  if (result === undefined) return null;

  const assessment = parseAssessment(value.assessment);
  if (value.assessment !== undefined && assessment === undefined) return null;

  const proposal = parseProposal(value.proposal);
  if (value.proposal !== undefined && proposal === undefined) return null;

  return Object.freeze({
    schemaVersion: 1 as const,
    project: Object.freeze({ name: value.project.name }),
    result,
    ...(isProfile(value.profile) ? { profile: value.profile } : {}),
    ...(assessment === undefined ? {} : { assessment }),
    ...(proposal === undefined ? {} : { proposal }),
  });
}

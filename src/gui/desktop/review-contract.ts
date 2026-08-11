export type ReviewDetail = Readonly<{
  git: Readonly<{
    branch: string;
    clean: boolean;
    requiresGit: boolean;
  }>;
  gitStatus: string;
  diffStat: string;
  documentationImpact: Readonly<{
    changedPaths: readonly string[];
    impacts: readonly Readonly<{
      document: string;
      reason: string;
      required: boolean;
    }>[];
    semanticReviewRequired: boolean;
  }>;
  validation: Readonly<{
    configured: boolean;
    commands: readonly string[];
  }>;
  health: "good" | "warning" | "error";
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isImpact(
  value: unknown,
): value is ReviewDetail["documentationImpact"]["impacts"][number] {
  return (
    isRecord(value) &&
    typeof value.document === "string" &&
    typeof value.reason === "string" &&
    typeof value.required === "boolean"
  );
}

export function parseReviewDetail(value: unknown): ReviewDetail | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !isRecord(value.git) ||
    !isRecord(value.documentationImpact) ||
    !isRecord(value.validation)
  ) {
    return null;
  }

  if (
    typeof value.git.branch !== "string" ||
    typeof value.git.clean !== "boolean" ||
    typeof value.git.requiresGit !== "boolean" ||
    typeof value.gitStatus !== "string" ||
    typeof value.diffStat !== "string" ||
    !isStringArray(value.documentationImpact.changedPaths) ||
    !Array.isArray(value.documentationImpact.impacts) ||
    !value.documentationImpact.impacts.every(isImpact) ||
    typeof value.documentationImpact.semanticReviewRequired !== "boolean" ||
    typeof value.validation.configured !== "boolean" ||
    !isStringArray(value.validation.commands) ||
    (value.health !== "good" &&
      value.health !== "warning" &&
      value.health !== "error")
  ) {
    return null;
  }

  return Object.freeze({
    git: Object.freeze({
      branch: value.git.branch,
      clean: value.git.clean,
      requiresGit: value.git.requiresGit,
    }),
    gitStatus: value.gitStatus,
    diffStat: value.diffStat,
    documentationImpact: Object.freeze({
      changedPaths: Object.freeze([...value.documentationImpact.changedPaths]),
      impacts: Object.freeze(
        value.documentationImpact.impacts.map((impact) =>
          Object.freeze({
            document: impact.document,
            reason: impact.reason,
            required: impact.required,
          }),
        ),
      ),
      semanticReviewRequired: value.documentationImpact.semanticReviewRequired,
    }),
    validation: Object.freeze({
      configured: value.validation.configured,
      commands: Object.freeze([...value.validation.commands]),
    }),
    health: value.health,
  });
}

export const SUMMARY_WORK_AVAILABILITY_REASONS = [
  "roadmap_configured",
  "connect_discovered_roadmap",
  "no_roadmap_present",
  "maintenance_no_work",
  "deferred_no_work",
  "external_planning_source",
  "no_admissible_candidate",
] as const;

export type SummaryWorkAvailabilityReason =
  (typeof SUMMARY_WORK_AVAILABILITY_REASONS)[number];

export type SummaryProject = Readonly<{
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;
  git: Readonly<{
    branch: string;
    clean: boolean;
  }>;
  health: "good" | "warning" | "error";
  workAvailability?: Readonly<{
    actionable: boolean;
    reason: SummaryWorkAvailabilityReason;
  }>;
  lastRun?: Readonly<{
    status: "completed" | "blocked" | "failed" | "cancelled";
    completedAt: string | null;
  }> | null;
  runHistoryCorruptedLines?: number;
}>;

export type SummaryResponse = Readonly<{
  schemaVersion: 1;
  projects: readonly SummaryProject[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkAvailabilityReason(
  value: unknown,
): value is SummaryWorkAvailabilityReason {
  return (
    typeof value === "string" &&
    (SUMMARY_WORK_AVAILABILITY_REASONS as readonly string[]).includes(value)
  );
}

function isLastRun(value: unknown): value is NonNullable<SummaryProject["lastRun"]> {
  return (
    isRecord(value) &&
    (value.status === "completed" ||
      value.status === "blocked" ||
      value.status === "failed" ||
      value.status === "cancelled") &&
    (value.completedAt === null || typeof value.completedAt === "string")
  );
}

function isSummaryProject(value: unknown): value is SummaryProject {
  if (!isRecord(value) || !isRecord(value.project) || !isRecord(value.git)) {
    return false;
  }

  const workAvailability = value.workAvailability;
  if (
    workAvailability !== undefined &&
    (!isRecord(workAvailability) ||
      typeof workAvailability.actionable !== "boolean" ||
      !isWorkAvailabilityReason(workAvailability.reason))
  ) {
    return false;
  }

  if (
    value.lastRun !== undefined &&
    value.lastRun !== null &&
    !isLastRun(value.lastRun)
  ) {
    return false;
  }

  if (
    value.runHistoryCorruptedLines !== undefined &&
    (typeof value.runHistoryCorruptedLines !== "number" ||
      !Number.isInteger(value.runHistoryCorruptedLines) ||
      value.runHistoryCorruptedLines < 0)
  ) {
    return false;
  }

  return (
    typeof value.project.name === "string" &&
    typeof value.project.type === "string" &&
    typeof value.project.path === "string" &&
    typeof value.git.branch === "string" &&
    typeof value.git.clean === "boolean" &&
    (value.health === "good" ||
      value.health === "warning" ||
      value.health === "error")
  );
}

export function parseSummaryResponse(value: unknown): SummaryResponse | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.projects)
  ) {
    return null;
  }

  if (!value.projects.every(isSummaryProject)) return null;

  return Object.freeze({
    schemaVersion: 1,
    projects: Object.freeze([...value.projects]),
  });
}

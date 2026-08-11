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
}>;

export type SummaryResponse = Readonly<{
  schemaVersion: 1;
  projects: readonly SummaryProject[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSummaryProject(value: unknown): value is SummaryProject {
  if (!isRecord(value) || !isRecord(value.project) || !isRecord(value.git)) {
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

export type ProjectReviewReport = Readonly<{
  schemaVersion: 1;
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;
  git: unknown;
  gitStatus: unknown;
  diffStat: unknown;
  validation: unknown;
  health: string;
}>;

export function parseProjectReviewReport(raw: string): ProjectReviewReport {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Loop CLI review returned invalid JSON");
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("project" in value) ||
    typeof value.project !== "object" ||
    value.project === null ||
    !("name" in value.project) ||
    typeof value.project.name !== "string" ||
    !("type" in value.project) ||
    typeof value.project.type !== "string" ||
    !("path" in value.project) ||
    typeof value.project.path !== "string" ||
    !("git" in value) ||
    !("gitStatus" in value) ||
    !("diffStat" in value) ||
    !("validation" in value) ||
    !("health" in value) ||
    typeof value.health !== "string"
  ) {
    throw new Error(
      "Loop CLI review returned an invalid schemaVersion 1 contract",
    );
  }

  return value as ProjectReviewReport;
}

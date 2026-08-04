export type ProjectNextReport = Readonly<{
  schemaVersion: 1;
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;
  git: unknown;
  roadmap: Readonly<{
    selectedCandidate: unknown | null;
  }>;
  validation: unknown;
  health: string;
}>;

export function parseProjectNextReport(raw: string): ProjectNextReport {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Loop CLI next returned invalid JSON");
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
    !("roadmap" in value) ||
    typeof value.roadmap !== "object" ||
    value.roadmap === null ||
    !("selectedCandidate" in value.roadmap) ||
    !("health" in value) ||
    typeof value.health !== "string"
  ) {
    throw new Error("Loop CLI next returned an invalid schemaVersion 1 contract");
  }

  return value as ProjectNextReport;
}

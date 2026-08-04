export type ProjectPlanReport = Readonly<{
  schemaVersion: 1;
  runId: string;
  project: string;
  mode: "plan";
  status: string;
  modifiedFiles: readonly unknown[];
}>;

export function parseProjectPlanReport(raw: string): ProjectPlanReport {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Loop CLI run returned invalid JSON");
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("runId" in value) ||
    typeof value.runId !== "string" ||
    !("project" in value) ||
    typeof value.project !== "string" ||
    !("mode" in value) ||
    value.mode !== "plan" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !("modifiedFiles" in value) ||
    !Array.isArray(value.modifiedFiles)
  ) {
    throw new Error(
      "Loop CLI run returned an invalid schemaVersion 1 plan contract",
    );
  }

  return value as ProjectPlanReport;
}

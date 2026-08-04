export type WorkspaceSummary = Readonly<{
  schemaVersion: 1;
  projects: readonly unknown[];
}>;

export function parseWorkspaceSummary(raw: string): WorkspaceSummary {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Loop CLI summary returned invalid JSON");
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("projects" in value) ||
    !Array.isArray(value.projects)
  ) {
    throw new Error("Loop CLI summary returned an invalid schemaVersion 1 contract");
  }

  return {
    schemaVersion: 1,
    projects: value.projects,
  };
}

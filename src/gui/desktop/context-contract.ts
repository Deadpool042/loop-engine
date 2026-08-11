export type ContextDetail = Readonly<{
  docs: Readonly<{
    required: readonly string[];
    missing: readonly string[];
  }>;
  roadmap: Readonly<{
    available: boolean;
    paths: readonly string[];
    selectedCandidate: Readonly<{
      path: string;
      line: number;
      text: string;
      kind: "safe" | "warning" | "blocked";
      status: string;
    }> | null;
  }>;
  validation: Readonly<{
    configured: boolean;
    commands: readonly string[];
  }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isSelectedCandidate(
  value: unknown,
): value is NonNullable<ContextDetail["roadmap"]["selectedCandidate"]> {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    typeof value.line === "number" &&
    typeof value.text === "string" &&
    (value.kind === "safe" ||
      value.kind === "warning" ||
      value.kind === "blocked") &&
    typeof value.status === "string"
  );
}

export function parseContextDetail(value: unknown): ContextDetail | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !isRecord(value.docs) ||
    !isRecord(value.roadmap) ||
    !isRecord(value.validation)
  ) {
    return null;
  }

  if (
    !isStringArray(value.docs.required) ||
    !isStringArray(value.docs.missing) ||
    typeof value.roadmap.available !== "boolean" ||
    !isStringArray(value.roadmap.paths) ||
    (value.roadmap.selectedCandidate !== null &&
      !isSelectedCandidate(value.roadmap.selectedCandidate)) ||
    typeof value.validation.configured !== "boolean" ||
    !isStringArray(value.validation.commands)
  ) {
    return null;
  }

  return Object.freeze({
    docs: Object.freeze({
      required: Object.freeze([...value.docs.required]),
      missing: Object.freeze([...value.docs.missing]),
    }),
    roadmap: Object.freeze({
      available: value.roadmap.available,
      paths: Object.freeze([...value.roadmap.paths]),
      selectedCandidate:
        value.roadmap.selectedCandidate === null
          ? null
          : Object.freeze({
              path: value.roadmap.selectedCandidate.path,
              line: value.roadmap.selectedCandidate.line,
              text: value.roadmap.selectedCandidate.text,
              kind: value.roadmap.selectedCandidate.kind,
              status: value.roadmap.selectedCandidate.status,
            }),
    }),
    validation: Object.freeze({
      configured: value.validation.configured,
      commands: Object.freeze([...value.validation.commands]),
    }),
  });
}

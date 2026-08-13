export type ContextDetail = Readonly<{
  docs: Readonly<{
    required: readonly string[];
    missing: readonly string[];
  }>;
  roadmap: Readonly<{
    available: boolean;
    paths: readonly string[];
    phaseGates: readonly Readonly<{
      phaseId: string;
      state: "open" | "closed";
      blockedBy?: string;
    }>[];
    selectedCandidate: Readonly<{
      id?: string;
      phaseId?: string;
      path: string;
      line: number;
      text: string;
      kind: "safe" | "warning" | "blocked";
      status: string;
      admissibility?: Readonly<{
        state: "admissible" | "not_admissible";
        reason: string;
        blockedBy?: string;
      }>;
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
    (value.id === undefined || typeof value.id === "string") &&
    (value.phaseId === undefined || typeof value.phaseId === "string") &&
    typeof value.line === "number" &&
    typeof value.text === "string" &&
    (value.kind === "safe" ||
      value.kind === "warning" ||
      value.kind === "blocked") &&
    typeof value.status === "string" &&
    (value.admissibility === undefined ||
      (isRecord(value.admissibility) &&
        (value.admissibility.state === "admissible" ||
          value.admissibility.state === "not_admissible") &&
        typeof value.admissibility.reason === "string" &&
        (value.admissibility.blockedBy === undefined ||
          typeof value.admissibility.blockedBy === "string")))
  );
}

function isPhaseGate(value: unknown): value is ContextDetail["roadmap"]["phaseGates"][number] {
  return (
    isRecord(value) &&
    typeof value.phaseId === "string" &&
    (value.state === "open" || value.state === "closed") &&
    (value.blockedBy === undefined || typeof value.blockedBy === "string")
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
    !Array.isArray(value.roadmap.phaseGates) ||
    !value.roadmap.phaseGates.every(isPhaseGate) ||
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
      phaseGates: Object.freeze(
        value.roadmap.phaseGates.map((gate) =>
          Object.freeze({
            phaseId: gate.phaseId,
            state: gate.state,
            ...(gate.blockedBy === undefined ? {} : { blockedBy: gate.blockedBy }),
          }),
        ),
      ),
      selectedCandidate:
        value.roadmap.selectedCandidate === null
          ? null
          : Object.freeze({
              ...(value.roadmap.selectedCandidate.id === undefined
                ? {}
                : { id: value.roadmap.selectedCandidate.id }),
              ...(value.roadmap.selectedCandidate.phaseId === undefined
                ? {}
                : { phaseId: value.roadmap.selectedCandidate.phaseId }),
              path: value.roadmap.selectedCandidate.path,
              line: value.roadmap.selectedCandidate.line,
              text: value.roadmap.selectedCandidate.text,
              kind: value.roadmap.selectedCandidate.kind,
              status: value.roadmap.selectedCandidate.status,
              ...(value.roadmap.selectedCandidate.admissibility === undefined
                ? {}
                : {
                    admissibility: Object.freeze({
                      state: value.roadmap.selectedCandidate.admissibility.state,
                      reason: value.roadmap.selectedCandidate.admissibility.reason,
                      ...(value.roadmap.selectedCandidate.admissibility.blockedBy === undefined
                        ? {}
                        : {
                            blockedBy:
                              value.roadmap.selectedCandidate.admissibility.blockedBy,
                          }),
                    }),
                  }),
            }),
    }),
    validation: Object.freeze({
      configured: value.validation.configured,
      commands: Object.freeze([...value.validation.commands]),
    }),
  });
}

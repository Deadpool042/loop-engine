export type ContextDetail = Readonly<{
  git?: Readonly<{
    statusText: string;
  }>;
  planning?: Readonly<{
    mode: "roadmap" | "maintenance" | "deferred" | "external" | null;
    roadmapConfigured: boolean;
    recommendation:
      | "roadmap_configured"
      | "connect_discovered_roadmap"
      | "no_roadmap_present"
      | "maintenance_no_work"
      | "deferred_no_work"
      | "external_planning_source"
      | "no_admissible_candidate";
  }>;
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
    stats?: Readonly<{
      total: number;
      todo: number;
      inProgress: number;
      done: number;
      unknown: number;
      safe: number;
      warning: number;
      blocked: number;
    }>;
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

function isPhaseGate(
  value: unknown,
): value is ContextDetail["roadmap"]["phaseGates"][number] {
  return (
    isRecord(value) &&
    typeof value.phaseId === "string" &&
    (value.state === "open" || value.state === "closed") &&
    (value.blockedBy === undefined || typeof value.blockedBy === "string")
  );
}

function isRoadmapStats(
  value: unknown,
): value is NonNullable<ContextDetail["roadmap"]["stats"]> {
  if (!isRecord(value)) return false;
  return [
    "total",
    "todo",
    "inProgress",
    "done",
    "unknown",
    "safe",
    "warning",
    "blocked",
  ].every((key) => typeof value[key] === "number");
}

function isPlanning(
  value: unknown,
): value is NonNullable<ContextDetail["planning"]> {
  if (!isRecord(value)) return false;
  return (
    (value.mode === "roadmap" ||
      value.mode === "maintenance" ||
      value.mode === "deferred" ||
      value.mode === "external" ||
      value.mode === null) &&
    typeof value.roadmapConfigured === "boolean" &&
    (value.recommendation === "roadmap_configured" ||
      value.recommendation === "connect_discovered_roadmap" ||
      value.recommendation === "no_roadmap_present" ||
      value.recommendation === "maintenance_no_work" ||
      value.recommendation === "deferred_no_work" ||
      value.recommendation === "external_planning_source" ||
      value.recommendation === "no_admissible_candidate")
  );
}

function isGit(value: unknown): value is NonNullable<ContextDetail["git"]> {
  return isRecord(value) && typeof value.statusText === "string";
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
    (value.roadmap.stats !== undefined && !isRoadmapStats(value.roadmap.stats)) ||
    (value.roadmap.selectedCandidate !== null &&
      !isSelectedCandidate(value.roadmap.selectedCandidate)) ||
    (value.planning !== undefined && !isPlanning(value.planning)) ||
    (value.git !== undefined && !isGit(value.git)) ||
    typeof value.validation.configured !== "boolean" ||
    !isStringArray(value.validation.commands)
  ) {
    return null;
  }

  return Object.freeze({
    ...(value.git === undefined
      ? {}
      : { git: Object.freeze({ statusText: value.git.statusText }) }),
    ...(value.planning === undefined
      ? {}
      : {
          planning: Object.freeze({
            mode: value.planning.mode,
            roadmapConfigured: value.planning.roadmapConfigured,
            recommendation: value.planning.recommendation,
          }),
        }),
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
      ...(value.roadmap.stats === undefined
        ? {}
        : {
            stats: Object.freeze({
              total: value.roadmap.stats.total,
              todo: value.roadmap.stats.todo,
              inProgress: value.roadmap.stats.inProgress,
              done: value.roadmap.stats.done,
              unknown: value.roadmap.stats.unknown,
              safe: value.roadmap.stats.safe,
              warning: value.roadmap.stats.warning,
              blocked: value.roadmap.stats.blocked,
            }),
          }),
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

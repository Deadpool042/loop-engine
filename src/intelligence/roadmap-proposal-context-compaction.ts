import type { RoadmapProposalContextReport } from "../core/reports.js";

/**
 * Local, deterministic token estimate for JSON payloads. JSON tokenizes worse than
 * prose (punctuation-heavy), so this ratio is a documented approximation, not a
 * calibrated tokenizer. Recalibrate against a real `usage.inputTokens` value from a
 * burn-in call whenever one is available, and update this comment with the observed
 * ratio.
 */
const ESTIMATED_BYTES_PER_TOKEN = 3.5;

export function estimateTokenCount(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / ESTIMATED_BYTES_PER_TOKEN);
}

type CompactCandidate = Readonly<{
  path: string;
  text: string;
  status: "todo" | "in_progress" | "done" | "unknown";
  priority?: "p1" | "p2" | "p3";
  reason?: string;
  admissibility?: Readonly<{
    state: "admissible" | "not_admissible";
    reason:
      "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
    blockedBy?: string;
  }>;
}>;

type CompactRoadmapProposalContext = Readonly<{
  schemaVersion: 1;
  project: Readonly<{ name: string; type: string }>;
  planning: Readonly<{ mode: string | null }>;
  objective: Readonly<{ source: string | null; content: string }>;
  roadmap: Readonly<{
    stats: Readonly<{
      total: number;
      todo: number;
      inProgress: number;
      done: number;
      unknown: number;
      blocked: number;
    }>;
    selectedCandidate: unknown;
    candidates: Readonly<{
      items: readonly CompactCandidate[];
      totalCount: number;
    }>;
    phaseGatesBlockedCount: number;
  }>;
  projectState: Readonly<{
    gitClean: boolean;
    validationConfigured: boolean;
    health: string;
  }>;
}>;

/**
 * Projects the full `RoadmapProposalContextReport` down to only the fields the
 * roadmap-proposal system prompt asks the model to reason about (compare the
 * canonical objective against the recorded state; distinguish observable gaps
 * from assumptions). This is a read-only boundary transform: it never changes the
 * shape consumed by `roadmap proposal-context`/`context` or the GUI's technical
 * detail panel, both of which keep reading the full report.
 *
 * Cuts applied, and why each is safe to drop for this decision:
 *  - Per-field `*Truncated: false` booleans repeated on every project/objective/
 *    candidate entry: boilerplate: the collection-level `truncated` flag on
 *    candidates/phaseGates already signals loss, and routing already refuses to
 *    call the provider on a truncated context (see roadmap-proposal-routing.ts).
 *  - `reason: "no sensitive keyword detected"` on every `kind: "safe"` candidate:
 *    a constant restating the (already-implied) safe classification; kept for
 *    "warning"/"blocked" candidates, where it is the actual signal.
 *  - `priority: "default"`: the common case; kept only when non-default.
 *  - Already-`done` candidates: the system prompt only ever asks for
 *    `observedGaps`/`assumptions`, never a list of finished work, and `stats.done`
 *    already reports the count. Verbatim text of completed lines is not required
 *    to compare the objective against the *remaining* state.
 *  - `line` numbers, git branch name, validation command list, path/branch
 *    truncation flags: not used by the model to judge a gap; `git.clean` and
 *    `validation.configured` (booleans) are kept because "repo dirty" or
 *    "no validation configured" are themselves observable-gap signals.
 */
export function buildCompactRoadmapProposalContext(
  context: RoadmapProposalContextReport,
): CompactRoadmapProposalContext | null {
  if (context.context !== "available") return null;

  const items = context.roadmap.candidates.items
    .filter(
      (candidate) => candidate.status !== "done" || candidate.kind !== "safe",
    )
    .map((candidate): CompactCandidate => ({
      path: candidate.path,
      text: candidate.text,
      status: candidate.status,
      ...(candidate.priority === "default"
        ? {}
        : { priority: candidate.priority }),
      ...(candidate.kind === "safe" ? {} : { reason: candidate.reason }),
      ...(candidate.admissibility === undefined
        ? {}
        : {
            admissibility: {
              state: candidate.admissibility.state,
              reason: candidate.admissibility.reason,
              ...(candidate.admissibility.blockedBy === undefined
                ? {}
                : { blockedBy: candidate.admissibility.blockedBy }),
            },
          }),
    }));

  return Object.freeze({
    schemaVersion: 1 as const,
    project: Object.freeze({
      name: context.project.name,
      type: context.project.type,
    }),
    planning: Object.freeze({ mode: context.planning.mode }),
    objective: Object.freeze({
      source: context.objective.source,
      content: context.objective.content ?? "",
    }),
    roadmap: Object.freeze({
      stats: Object.freeze({
        total: context.roadmap.stats.total,
        todo: context.roadmap.stats.todo,
        inProgress: context.roadmap.stats.inProgress,
        done: context.roadmap.stats.done,
        unknown: context.roadmap.stats.unknown,
        blocked: context.roadmap.stats.blocked,
      }),
      selectedCandidate: context.roadmap.selectedCandidate,
      candidates: Object.freeze({
        items: Object.freeze(items),
        totalCount: context.roadmap.candidates.total,
      }),
      phaseGatesBlockedCount: context.roadmap.phaseGates.items.filter(
        (gate) => gate.state === "closed",
      ).length,
    }),
    projectState: Object.freeze({
      gitClean: context.projectState.git.clean,
      validationConfigured: context.projectState.validation.configured,
      health: context.projectState.health,
    }),
  });
}

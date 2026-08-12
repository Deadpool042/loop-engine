import type { ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type { ProjectSnapshot } from "../intelligence/snapshot.js";

export type LoopPlan =
  | Readonly<{
      outcome: "ready";
      candidate: RoadmapCandidate;
      plannedSteps: readonly string[];
      // Exposed so runLoopPlan can build the Minimal Context Package (V7.5)
      // via buildMinimalContext(snapshot, budget) without a second, duplicate
      // buildProjectSnapshot call — see docs/architecture/minimal-context-builder.md.
      snapshot: ProjectSnapshot;
    }>
  | Readonly<{
      outcome: "blocked";
      candidate: RoadmapCandidate | null;
      reason: string;
      code?:
        | "candidate_not_addressable"
        | "candidate_not_found"
        | "candidate_ambiguous"
        | "candidate_done"
        | "candidate_blocked"
        | "candidate_not_admissible";
    }>;

export type LoopPlanOptions = Readonly<{
  candidateId?: string;
}>;

const PLANNED_STEPS_AFTER_CANDIDATE = [
  "Prepare short project context (context)",
  "Prepare delegation prompt (prompt)",
  "Await explicit agent execution in mode execute",
  "Run local validation and audit before commit (validate, audit)",
  "Commit only in mode commit",
  "Publish only in mode publish",
] as const;

export function planLoopCycle(
  project: ProjectConfig,
  options: LoopPlanOptions = {},
): LoopPlan {
  const snapshot = buildProjectSnapshot(project);
  const requestedCandidateId = options.candidateId;

  if (requestedCandidateId !== undefined) {
    const addressableCandidates = snapshot.roadmap.candidates.filter(
      (candidate) => candidate.id !== undefined,
    );

    if (addressableCandidates.length === 0) {
      return {
        outcome: "blocked",
        candidate: null,
        code: "candidate_not_addressable",
        reason: "This roadmap does not expose addressable candidate identifiers.",
      };
    }

    const matches = addressableCandidates.filter(
      (candidate) => candidate.id === requestedCandidateId,
    );

    if (matches.length === 0) {
      return {
        outcome: "blocked",
        candidate: null,
        code: "candidate_not_found",
        reason: `No roadmap candidate matches identifier: ${requestedCandidateId}`,
      };
    }

    if (matches.length > 1) {
      return {
        outcome: "blocked",
        candidate: null,
        code: "candidate_ambiguous",
        reason: `Multiple roadmap candidates match identifier: ${requestedCandidateId}`,
      };
    }

    const candidate = matches[0]!;
    if (candidate.status === "done") {
      return {
        outcome: "blocked",
        candidate,
        code: "candidate_done",
        reason: `Roadmap candidate is already done: ${requestedCandidateId}`,
      };
    }

    if (candidate.kind === "blocked") {
      return {
        outcome: "blocked",
        candidate,
        code: "candidate_blocked",
        reason: `Roadmap candidate is blocked: ${requestedCandidateId}`,
      };
    }

    if (candidate.status === "unknown") {
      return {
        outcome: "blocked",
        candidate,
        code: "candidate_not_admissible",
        reason: `Roadmap candidate is not admissible: ${requestedCandidateId}`,
      };
    }

    return {
      outcome: "ready",
      candidate,
      plannedSteps: [
        `Select roadmap candidate: ${candidate.text}`,
        ...PLANNED_STEPS_AFTER_CANDIDATE,
      ],
      snapshot,
    };
  }

  const candidate = snapshot.roadmap.selectedCandidate;

  if (!candidate) {
    return {
      outcome: "blocked",
      candidate: null,
      reason: "No roadmap candidate available.",
    };
  }

  if (candidate.kind === "blocked") {
    return {
      outcome: "blocked",
      candidate,
      reason:
        "Only a blocked roadmap candidate is available; choose a smaller safe prerequisite first.",
    };
  }

  return {
    outcome: "ready",
    candidate,
    plannedSteps: [
      `Select roadmap candidate: ${candidate.text}`,
      ...PLANNED_STEPS_AFTER_CANDIDATE,
    ],
    snapshot,
  };
}

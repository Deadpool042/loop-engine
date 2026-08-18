import type { ProjectConfig } from "../core/config.js";
import { resolveExecutionAuthorization } from "../governance/execution-authorization.js";
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
      // Set only when the project opted into the project-owned, SHA-bound
      // execution decision contract and this candidate was authorized by it
      // (rather than by heuristic roadmap selection).
      authorizedBy?: "execution_decision";
      allowedPaths?: readonly string[];
      brief?: Readonly<{
        objective: string;
        deliverables: readonly string[];
        outOfScope: readonly string[];
        forbiddenContentTerms?: readonly string[];
      }>;
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
        | "candidate_not_admissible"
        | "candidate_phase_closed"
        | "candidate_phase_gate_invalid"
        | "candidate_authorization_mismatch"
        | "decision_missing"
        | "decision_malformed"
        | "scope_missing"
        | "scope_malformed"
        | "project_mismatch"
        | "sha_stale"
        | "decision_blocked"
        | "decision_revalidation_required"
        | "decision_no_actionable_work";
    }>;

export type LoopPlanOptions = Readonly<{
  candidateId?: string;
  /** Canonical project path used to resolve a project-scoped execution decision. */
  executionDecisionProjectPath?: string;
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

  const authorization = resolveExecutionAuthorization(
    project,
    options.executionDecisionProjectPath ?? snapshot.project.path,
    snapshot.git.lastCommit?.hash ?? null,
  );

  if (authorization.governed && !authorization.authorized) {
    return {
      outcome: "blocked",
      candidate: null,
      code: authorization.code,
      reason: authorization.reason,
    };
  }

  let requestedCandidateId = options.candidateId;

  if (authorization.governed) {
    if (
      requestedCandidateId !== undefined &&
      requestedCandidateId !== authorization.candidateId
    ) {
      return {
        outcome: "blocked",
        candidate: null,
        code: "candidate_authorization_mismatch",
        reason: `Requested candidate ${requestedCandidateId} does not match the execution decision's authorized candidate ${authorization.candidateId}.`,
      };
    }
    requestedCandidateId = authorization.candidateId;
  }

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

    if (candidate.admissibility?.state === "not_admissible") {
      const code =
        candidate.admissibility.reason === "phase_closed"
          ? "candidate_phase_closed"
          : "candidate_phase_gate_invalid";
      const blockedBy = candidate.admissibility.blockedBy;
      return {
        outcome: "blocked",
        candidate,
        code,
        reason:
          code === "candidate_phase_closed"
            ? `Roadmap candidate phase is closed: ${requestedCandidateId}${blockedBy ? ` (blocked by ${blockedBy})` : ""}`
            : `Roadmap phase gate is invalid: ${requestedCandidateId}`,
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
      ...(authorization.governed
        ? {
            authorizedBy: "execution_decision" as const,
            allowedPaths: authorization.allowedPaths,
            ...(authorization.brief === undefined ? {} : { brief: authorization.brief }),
          }
        : {}),
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

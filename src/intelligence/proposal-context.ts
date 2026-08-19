import { type ProjectSnapshot } from "./snapshot.js";

export const MAX_PROPOSAL_CONTEXT_CANDIDATES = 50;
export const MAX_PROPOSAL_CONTEXT_PHASE_GATES = 50;
export const MAX_PROPOSAL_CONTEXT_CANDIDATE_TEXT_CHARACTERS = 2_048;

type ProposalCandidate = Readonly<{
  id?: string;
  phaseId?: string;
  path: string;
  line: number;
  text: string;
  textTruncated: boolean;
  kind: "safe" | "warning" | "blocked";
  reason: string;
  status: "todo" | "in_progress" | "done" | "unknown";
  priority: "p1" | "p2" | "p3" | "default";
  admissibility?: Readonly<{
    state: "admissible" | "not_admissible";
    reason: "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
    blockedBy?: string;
  }>;
}>;

function boundedText(value: string): Readonly<{
  value: string;
  truncated: boolean;
}> {
  if (value.length <= MAX_PROPOSAL_CONTEXT_CANDIDATE_TEXT_CHARACTERS) {
    return { value, truncated: false };
  }

  return {
    value: value.slice(0, MAX_PROPOSAL_CONTEXT_CANDIDATE_TEXT_CHARACTERS),
    truncated: true,
  };
}

export function projectRoadmapProposalCandidate(
  candidate: ProjectSnapshot["roadmap"]["candidates"][number],
): ProposalCandidate {
  const text = boundedText(candidate.text);
  return Object.freeze({
    ...(candidate.id === undefined ? {} : { id: candidate.id }),
    ...(candidate.phaseId === undefined ? {} : { phaseId: candidate.phaseId }),
    path: candidate.path,
    line: candidate.line,
    text: text.value,
    textTruncated: text.truncated,
    kind: candidate.kind,
    reason: candidate.reason,
    status: candidate.status,
    priority: candidate.priority,
    ...(candidate.admissibility === undefined
      ? {}
      : { admissibility: candidate.admissibility }),
  });
}

/**
 * Projects only canonical snapshot data into a bounded, inspectable context.
 * It never changes planning, candidate admissibility, gates, or selection.
 */
export function buildRoadmapProposalContext(
  snapshot: ProjectSnapshot,
): Readonly<{
  candidates: Readonly<{
    items: readonly ProposalCandidate[];
    total: number;
    truncated: boolean;
  }>;
  phaseGates: Readonly<{
    items: ProjectSnapshot["roadmap"]["phaseGates"];
    total: number;
    truncated: boolean;
  }>;
}> {
  const candidates = snapshot.roadmap.candidates;
  const phaseGates = snapshot.roadmap.phaseGates;

  return Object.freeze({
    candidates: Object.freeze({
      items: Object.freeze(
        candidates
          .slice(0, MAX_PROPOSAL_CONTEXT_CANDIDATES)
          .map(projectRoadmapProposalCandidate),
      ),
      total: candidates.length,
      truncated: candidates.length > MAX_PROPOSAL_CONTEXT_CANDIDATES,
    }),
    phaseGates: Object.freeze({
      items: Object.freeze(phaseGates.slice(0, MAX_PROPOSAL_CONTEXT_PHASE_GATES)),
      total: phaseGates.length,
      truncated: phaseGates.length > MAX_PROPOSAL_CONTEXT_PHASE_GATES,
    }),
  });
}

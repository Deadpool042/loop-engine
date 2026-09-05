import { createHash } from "node:crypto";

import { type ProjectSnapshot } from "./snapshot.js";

export const MAX_PROPOSAL_CONTEXT_CANDIDATES = 50;
export const MAX_PROPOSAL_CONTEXT_PHASE_GATES = 50;
export const MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS = 50;
export const MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS = 50;
export const MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS = 2_048;
export const MAX_PROPOSAL_CONTEXT_CANDIDATE_TEXT_CHARACTERS =
  MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS;

type BoundedString = Readonly<{
  value: string;
  truncated: boolean;
}>;

type ProposalCandidate = Readonly<{
  id?: string;
  idTruncated?: boolean;
  phaseId?: string;
  phaseIdTruncated?: boolean;
  path: string;
  pathTruncated: boolean;
  line: number;
  detailKey: string;
  text: string;
  textTruncated: boolean;
  kind: "safe" | "warning" | "blocked";
  reason: string;
  reasonTruncated: boolean;
  status: "todo" | "in_progress" | "done" | "unknown";
  priority: "p1" | "p2" | "p3" | "default";
  admissibility?: Readonly<{
    state: "admissible" | "not_admissible";
    reason: "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
    blockedBy?: string;
    blockedByTruncated?: boolean;
  }>;
}>;

type ProposalPhaseGate = Readonly<{
  path: string;
  pathTruncated: boolean;
  line: number;
  phaseId: string;
  phaseIdTruncated: boolean;
  state: "open" | "closed";
  blockedBy?: string;
  blockedByTruncated?: boolean;
}>;

export function boundProposalContextString(value: string): BoundedString {
  if (value.length <= MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS) {
    return { value, truncated: false };
  }

  return {
    value: value.slice(0, MAX_PROPOSAL_CONTEXT_STRING_CHARACTERS),
    truncated: true,
  };
}

function projectOptionalString(
  value: string | undefined,
  field: "id" | "phaseId" | "blockedBy",
): Record<string, string | boolean> {
  if (value === undefined) return {};

  const bounded = boundProposalContextString(value);
  return {
    [field]: bounded.value,
    [`${field}Truncated`]: bounded.truncated,
  };
}

export function roadmapCandidateDetailKey(
  candidate: ProjectSnapshot["roadmap"]["candidates"][number],
): string {
  return createHash("sha256")
    .update(candidate.path)
    .update("\0")
    .update(String(candidate.line))
    .update("\0")
    .update(candidate.text)
    .digest("hex")
    .slice(0, 32);
}

export function projectRoadmapProposalCandidate(
  candidate: ProjectSnapshot["roadmap"]["candidates"][number],
): ProposalCandidate {
  const path = boundProposalContextString(candidate.path);
  const text = boundProposalContextString(candidate.text);
  const reason = boundProposalContextString(candidate.reason);

  return Object.freeze({
    ...projectOptionalString(candidate.id, "id"),
    ...projectOptionalString(candidate.phaseId, "phaseId"),
    path: path.value,
    pathTruncated: path.truncated,
    line: candidate.line,
    detailKey: roadmapCandidateDetailKey(candidate),
    text: text.value,
    textTruncated: text.truncated,
    kind: candidate.kind,
    reason: reason.value,
    reasonTruncated: reason.truncated,
    status: candidate.status,
    priority: candidate.priority,
    ...(candidate.admissibility === undefined
      ? {}
      : {
          admissibility: Object.freeze({
            state: candidate.admissibility.state,
            reason: candidate.admissibility.reason,
            ...projectOptionalString(candidate.admissibility.blockedBy, "blockedBy"),
          }),
        }),
  }) as ProposalCandidate;
}

export function projectRoadmapProposalPhaseGate(
  phaseGate: ProjectSnapshot["roadmap"]["phaseGates"][number],
): ProposalPhaseGate {
  const path = boundProposalContextString(phaseGate.path);
  const phaseId = boundProposalContextString(phaseGate.phaseId);

  return Object.freeze({
    path: path.value,
    pathTruncated: path.truncated,
    line: phaseGate.line,
    phaseId: phaseId.value,
    phaseIdTruncated: phaseId.truncated,
    state: phaseGate.state,
    ...projectOptionalString(phaseGate.blockedBy, "blockedBy"),
  }) as ProposalPhaseGate;
}

export function projectRoadmapProposalStringCollection(
  values: readonly string[],
  maximumItems: number,
): Readonly<{
  items: readonly string[];
  total: number;
  truncated: boolean;
}> {
  const items = values.slice(0, maximumItems).map(boundProposalContextString);
  return Object.freeze({
    items: Object.freeze(items.map(({ value }) => value)),
    total: values.length,
    truncated:
      values.length > maximumItems || items.some((item) => item.truncated),
  });
}

/**
 * Projects only canonical snapshot data into a bounded, inspectable context.
 * It never changes planning, candidate admissibility, gates, or selection.
 */
type BoundedRoadmapProposalContext = Readonly<{
  candidates: Readonly<{
    items: readonly ProposalCandidate[];
    total: number;
    truncated: boolean;
  }>;
  phaseGates: Readonly<{
    items: readonly ProposalPhaseGate[];
    total: number;
    truncated: boolean;
  }>;
}>;

function projectBoundedRoadmapContext(
  candidates: ProjectSnapshot["roadmap"]["candidates"],
  phaseGates: ProjectSnapshot["roadmap"]["phaseGates"],
): BoundedRoadmapProposalContext {
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
      items: Object.freeze(
        phaseGates
          .slice(0, MAX_PROPOSAL_CONTEXT_PHASE_GATES)
          .map(projectRoadmapProposalPhaseGate),
      ),
      total: phaseGates.length,
      truncated: phaseGates.length > MAX_PROPOSAL_CONTEXT_PHASE_GATES,
    }),
  });
}

/**
 * Full bounded roadmap projection used by read-only overview surfaces.
 * Historical completed candidates remain visible here; this is inventory,
 * not the model-facing renewal context.
 */
export function buildRoadmapProposalContext(
  snapshot: ProjectSnapshot,
): BoundedRoadmapProposalContext {
  return projectBoundedRoadmapContext(
    snapshot.roadmap.candidates,
    snapshot.roadmap.phaseGates,
  );
}

/**
 * Bounded renewal context used by roadmap proposal and gate-reassessment calls.
 *
 * Completed candidates are historical evidence already represented by
 * `roadmap.stats.done`; their verbatim text must never consume the finite
 * candidate window or make a completed roadmap appear truncated. Phase gates
 * are retained only when they belong to a still-active candidate. Relative
 * order remains canonical within both collections.
 *
 * This guarantees that:
 * - arbitrarily long completed history cannot force a deeper model or block a
 *   proposal call;
 * - an active candidate after many completed lots cannot disappear behind
 *   historical entries;
 * - genuine overflow of active work remains fail-closed via `truncated`.
 */
export function buildRoadmapRenewalContext(
  snapshot: ProjectSnapshot,
): BoundedRoadmapProposalContext {
  const candidates = snapshot.roadmap.candidates.filter(
    (candidate) => candidate.status !== "done",
  );
  const activePhaseIds = new Set(
    candidates.flatMap((candidate) =>
      candidate.phaseId === undefined ? [] : [candidate.phaseId],
    ),
  );
  const phaseGates = snapshot.roadmap.phaseGates.filter((gate) =>
    activePhaseIds.has(gate.phaseId),
  );

  return projectBoundedRoadmapContext(candidates, phaseGates);
}

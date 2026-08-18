import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export type RoadmapCandidateKind = "safe" | "warning" | "blocked";
export type RoadmapCandidateStatus =
  "todo" | "in_progress" | "done" | "unknown";
export type RoadmapPriority = "p1" | "p2" | "p3" | "default";
export type RoadmapPhaseGateState = "open" | "closed";
export type RoadmapCandidateAdmissibility = Readonly<{
  state: "admissible" | "not_admissible";
  reason: "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
  blockedBy?: string;
}>;
export type RoadmapPhaseGate = Readonly<{
  path: string;
  line: number;
  phaseId: string;
  state: RoadmapPhaseGateState;
  blockedBy?: string;
}>;

export type RoadmapCandidate = Readonly<{
  id?: string;
  phaseId?: string;
  path: string;
  line: number;
  text: string;
  kind: RoadmapCandidateKind;
  reason: string;
  status: RoadmapCandidateStatus;
  priority: RoadmapPriority;
  admissibility?: RoadmapCandidateAdmissibility;
}>;

export type RoadmapAnalysis = Readonly<{
  candidates: readonly RoadmapCandidate[];
  phaseGates: readonly RoadmapPhaseGate[];
}>;

const BLOCKED_PATTERNS = [
  "production finale",
  "mise en production",
  "paiement",
  "migration",
  "delete",
  "supprimer",
] as const;

const WARNING_PATTERNS = [
  "déploiement",
  "deploiement",
  "vps",
  "dns",
  "bascule",
  "sécurité",
  "securite",
] as const;

function detectCandidatePriority(line: string): RoadmapPriority {
  const match = line.match(/\[\s*(p[1-3])\s*\]/i);
  const priority = match?.[1]?.toLowerCase();

  if (priority === "p1" || priority === "p2" || priority === "p3") {
    return priority;
  }

  return "default";
}

function detectCandidateStatus(line: string): RoadmapCandidateStatus {
  if (line.includes("- [ ]")) {
    return "todo";
  }

  if (line.includes("- [x]") || line.includes("- [X]")) {
    return "done";
  }

  if (
    line.includes("⏳") ||
    line.includes("En cours") ||
    line.includes("en cours")
  ) {
    return "in_progress";
  }

  return "unknown";
}

function detectTableCandidateStatus(
  stateCell: string,
): RoadmapCandidateStatus {
  if (/✅|\bterminé\b/i.test(stateCell)) {
    return "done";
  }

  if (/⬜|\bà faire\b/i.test(stateCell)) {
    return "todo";
  }

  return "unknown";
}

function parseStructuredTableLotRow(line: string): Readonly<{
  id: string;
  text: string;
  status: RoadmapCandidateStatus;
}> | null {
  const match = line.match(
    /^\|\s*(H\d+-L\d+[A-Za-z]?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/,
  );

  if (!match) {
    return null;
  }

  return {
    id: match[1] ?? "",
    text: line,
    status: detectTableCandidateStatus(match[3] ?? ""),
  };
}

type ParsedPhaseGate =
  | Readonly<{ outcome: "valid"; phaseId: string; state: RoadmapPhaseGateState; blockedBy?: string }>
  | Readonly<{ outcome: "invalid"; phaseId?: string }>;

function parsePhaseGate(line: string): ParsedPhaseGate | null {
  if (!line.includes("loop-engine:phase-gate")) return null;

  const match = line.match(
    /^<!--\s*loop-engine:phase-gate\s+phase=(H\d+)\s+state=(open|closed)(?:\s+blockedBy=([A-Za-z0-9][A-Za-z0-9-]*))?\s*-->$/,
  );
  if (!match) {
    const phaseMatch = line.match(/\bphase=(H\d+)\b/);
    return phaseMatch?.[1]
      ? { outcome: "invalid", phaseId: phaseMatch[1] }
      : { outcome: "invalid" };
  }

  const phaseId = match[1]!;
  const state = match[2] as RoadmapPhaseGateState;
  const blockedBy = match[3];
  if ((state === "closed" && blockedBy === undefined) || (state === "open" && blockedBy !== undefined)) {
    return { outcome: "invalid", phaseId };
  }

  return {
    outcome: "valid",
    phaseId,
    state,
    ...(blockedBy === undefined ? {} : { blockedBy }),
  };
}

function phaseIdFromCandidateId(id: string | undefined): string | undefined {
  return id?.match(/^(H\d+)-L\d+[A-Za-z]?$/)?.[1];
}

function admissibilityForCandidate(options: {
  candidate: RoadmapCandidate;
  gates: ReadonlyMap<string, RoadmapPhaseGate>;
  invalidPhases: ReadonlySet<string>;
  invalidPaths: ReadonlySet<string>;
}): RoadmapCandidateAdmissibility {
  const phaseId = options.candidate.phaseId;
  if (
    (phaseId !== undefined && options.invalidPhases.has(phaseId)) ||
    options.invalidPaths.has(options.candidate.path)
  ) {
    return Object.freeze({ state: "not_admissible", reason: "phase_gate_invalid" });
  }

  if (phaseId === undefined) {
    return Object.freeze({ state: "admissible", reason: "no_phase_gate" });
  }

  const gate = options.gates.get(phaseId);
  if (!gate) return Object.freeze({ state: "admissible", reason: "no_phase_gate" });
  if (gate.state === "open") {
    return Object.freeze({ state: "admissible", reason: "phase_open" });
  }

  return Object.freeze({
    state: "not_admissible",
    reason: "phase_closed",
    ...(gate.blockedBy === undefined ? {} : { blockedBy: gate.blockedBy }),
  });
}

function classifyCandidateLine(line: string): Readonly<{
  kind: RoadmapCandidateKind;
  reason: string;
}> {
  const normalized = line.toLowerCase();

  const blockedPattern = BLOCKED_PATTERNS.find((pattern) =>
    normalized.includes(pattern),
  );

  if (blockedPattern) {
    return {
      kind: "blocked",
      reason: `contains "${blockedPattern}"`,
    };
  }

  const warningPattern = WARNING_PATTERNS.find((pattern) =>
    normalized.includes(pattern),
  );

  if (warningPattern) {
    return {
      kind: "warning",
      reason: `contains "${warningPattern}"`,
    };
  }

  return {
    kind: "safe",
    reason: "no sensitive keyword detected",
  };
}

function isMarkdownHeading(line: string): boolean {
  return /^#{1,6}(\s|$)/.test(line);
}

function isCandidateStart(line: string): boolean {
  if (isMarkdownHeading(line)) {
    return false;
  }

  return /^(?:- \[[ xX]\]|TODO\b|À faire\b|A faire\b|Prochain\b|prochain\b|Lot\b|lot\b|H[1-3]-L|⏳)/.test(
    line,
  );
}

function isRoadmapInventoryEntry(line: string): boolean {
  return isCandidateStart(line);
}

function isIndentedContinuation(line: string): boolean {
  return /^\s+\S/.test(line);
}

function collectCandidateText(
  lines: readonly string[],
  candidateIndex: number,
): Readonly<{ text: string; endIndex: number }> {
  const parts = [lines[candidateIndex]?.trim() ?? ""];
  let endIndex = candidateIndex;

  for (let index = candidateIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();

    if (
      trimmed.length === 0 ||
      isMarkdownHeading(trimmed) ||
      isRoadmapInventoryEntry(trimmed) ||
      !isIndentedContinuation(rawLine)
    ) {
      break;
    }

    parts.push(trimmed);
    endIndex = index;
  }

  return {
    text: parts.join(" "),
    endIndex,
  };
}

export function analyzeRoadmaps(
  project: ProjectConfig,
  projectPath: string,
): RoadmapAnalysis {
  const roadmapPaths = project.roadmap ?? [];
  const candidates: RoadmapCandidate[] = [];
  const gates: RoadmapPhaseGate[] = [];
  const invalidPhases = new Set<string>();
  const invalidPaths = new Set<string>();

  for (const roadmapPath of roadmapPaths) {
    const absolutePath = resolve(projectPath, roadmapPath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    const lines = readFileSync(absolutePath, "utf8").split("\n");
    const hasStructuredTableLots = lines.some((line) =>
      parseStructuredTableLotRow(line.trim()),
    );

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const trimmed = line.trim();

      const phaseGate = parsePhaseGate(trimmed);
      if (phaseGate) {
        if (phaseGate.outcome === "invalid") {
          if (phaseGate.phaseId) invalidPhases.add(phaseGate.phaseId);
          else invalidPaths.add(roadmapPath);
        } else {
          gates.push({
            path: roadmapPath,
            line: index + 1,
            phaseId: phaseGate.phaseId,
            state: phaseGate.state,
            ...(phaseGate.blockedBy === undefined ? {} : { blockedBy: phaseGate.blockedBy }),
          });
        }
        continue;
      }

      const tableLot = parseStructuredTableLotRow(trimmed);

      if (tableLot) {
        const classification = classifyCandidateLine(tableLot.text);
        const phaseId = phaseIdFromCandidateId(tableLot.id);

        candidates.push({
          id: tableLot.id,
          path: roadmapPath,
          line: index + 1,
          text: tableLot.text,
          kind: classification.kind,
          reason: classification.reason,
          status: tableLot.status,
          priority: detectCandidatePriority(tableLot.text),
          ...(phaseId === undefined ? {} : { phaseId }),
        });
        continue;
      }

      if (trimmed.length === 0 || !isRoadmapInventoryEntry(trimmed)) {
        continue;
      }

      const explicitCandidate = isCandidateStart(trimmed);

      if (hasStructuredTableLots && !explicitCandidate) {
        continue;
      }
      const collected = explicitCandidate
        ? collectCandidateText(lines, index)
        : { text: trimmed, endIndex: index };
      const classification = classifyCandidateLine(collected.text);

      candidates.push({
        path: roadmapPath,
        line: index + 1,
        text: collected.text,
        kind: classification.kind,
        reason: classification.reason,
        status: explicitCandidate ? detectCandidateStatus(trimmed) : "unknown",
        priority: explicitCandidate
          ? detectCandidatePriority(trimmed)
          : "default",
      });

      index = collected.endIndex;
    }
  }

  const gatesByPhase = new Map<string, RoadmapPhaseGate>();
  for (const gate of gates) {
    if (gatesByPhase.has(gate.phaseId)) {
      invalidPhases.add(gate.phaseId);
      gatesByPhase.delete(gate.phaseId);
    } else if (!invalidPhases.has(gate.phaseId)) {
      gatesByPhase.set(gate.phaseId, gate);
    }
  }

  const phaseGates = gates.filter((gate) => !invalidPhases.has(gate.phaseId));
  const analyzedCandidates = candidates.map((candidate) => {
    const phaseId = candidate.phaseId ?? phaseIdFromCandidateId(candidate.id);
    const candidateWithPhase = Object.freeze({
      ...candidate,
      ...(phaseId === undefined ? {} : { phaseId }),
    });
    return Object.freeze({
      ...candidateWithPhase,
      admissibility: admissibilityForCandidate({
        candidate: candidateWithPhase,
        gates: gatesByPhase,
        invalidPhases,
        invalidPaths,
      }),
    });
  });

  return Object.freeze({
    candidates: Object.freeze(analyzedCandidates),
    phaseGates: Object.freeze(phaseGates),
  });
}

export function findRoadmapCandidates(
  project: ProjectConfig,
  projectPath: string,
): readonly RoadmapCandidate[] {
  return analyzeRoadmaps(project, projectPath).candidates;
}

const PRIORITY_ORDER: readonly RoadmapPriority[] = [
  "p1",
  "p2",
  "p3",
  "default",
];

function selectByPriority(
  candidates: readonly RoadmapCandidate[],
): RoadmapCandidate | null {
  for (const priority of PRIORITY_ORDER) {
    const candidate = candidates.find((item) => item.priority === priority);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function selectRoadmapCandidate(
  candidates: readonly RoadmapCandidate[],
): RoadmapCandidate | null {
  const activeCandidates = candidates.filter(
    (candidate) =>
      candidate.status !== "done" &&
      candidate.admissibility?.state !== "not_admissible",
  );

  const safeCandidate = selectByPriority(
    activeCandidates.filter((candidate) => candidate.kind === "safe"),
  );
  const warningCandidate = selectByPriority(
    activeCandidates.filter((candidate) => candidate.kind === "warning"),
  );
  const blockedCandidate = selectByPriority(
    activeCandidates.filter((candidate) => candidate.kind === "blocked"),
  );

  return safeCandidate ?? warningCandidate ?? blockedCandidate ?? null;
}

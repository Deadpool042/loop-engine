import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export type RoadmapCandidateKind = "safe" | "warning" | "blocked";
export type RoadmapCandidateStatus =
  "todo" | "in_progress" | "done" | "unknown";
export type RoadmapPriority = "p1" | "p2" | "p3" | "default";

export type RoadmapCandidate = Readonly<{
  path: string;
  line: number;
  text: string;
  kind: RoadmapCandidateKind;
  reason: string;
  status: RoadmapCandidateStatus;
  priority: RoadmapPriority;
}>;

const CANDIDATE_PATTERNS = [
  "- [ ]",
  "- [x]",
  "- [X]",
  "TODO",
  "À faire",
  "A faire",
  "Prochain",
  "prochain",
  "Prochain lot",
  "prochain lot",
  "Lot ",
  "lot ",
  "H1-L",
  "H2-L",
  "H3-L",
  "⏳",
] as const;

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

function isCandidateLine(line: string): boolean {
  return CANDIDATE_PATTERNS.some((pattern) => line.includes(pattern));
}

export function findRoadmapCandidates(
  project: ProjectConfig,
  projectPath: string,
): readonly RoadmapCandidate[] {
  const roadmapPaths = project.roadmap ?? [];
  const candidates: RoadmapCandidate[] = [];

  for (const roadmapPath of roadmapPaths) {
    const absolutePath = resolve(projectPath, roadmapPath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    const lines = readFileSync(absolutePath, "utf8").split("\n");

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.length === 0 || !isCandidateLine(trimmed)) {
        return;
      }

      const classification = classifyCandidateLine(trimmed);

      candidates.push({
        path: roadmapPath,
        line: index + 1,
        text: trimmed,
        kind: classification.kind,
        reason: classification.reason,
        status: detectCandidateStatus(trimmed),
        priority: detectCandidatePriority(trimmed),
      });
    });
  }

  return candidates;
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
    (candidate) => candidate.status !== "done",
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

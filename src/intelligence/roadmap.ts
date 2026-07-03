import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export type RoadmapCandidateKind = "safe" | "warning" | "blocked";

export type RoadmapCandidate = Readonly<{
  path: string;
  line: number;
  text: string;
  kind: RoadmapCandidateKind;
}>;

const CANDIDATE_PATTERNS = [
  "- [ ]",
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
  "prod",
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

function classifyCandidateLine(line: string): RoadmapCandidateKind {
  const normalized = line.toLowerCase();

  if (BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "blocked";
  }

  if (WARNING_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "warning";
  }

  return "safe";
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

      candidates.push({
        path: roadmapPath,
        line: index + 1,
        text: trimmed,
        kind: classifyCandidateLine(trimmed),
      });
    });
  }

  return candidates;
}

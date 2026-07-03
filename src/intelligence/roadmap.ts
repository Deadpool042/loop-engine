import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export type RoadmapCandidate = Readonly<{
  path: string;
  line: number;
  text: string;
}>;

const CANDIDATE_PATTERNS = [
  "- [ ]",
  "TODO",
  "À faire",
  "A faire",
  "Prochain",
  "prochain",
] as const;

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
      });
    });
  }

  return candidates;
}

import assert from "node:assert/strict";
import test from "node:test";

import { printRoadmapOverview } from "../../src/commands/roadmap-overview.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";

test("renders a compact deterministic roadmap overview", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printRoadmapOverview(
      {
        generateRoadmapOverviewReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "creatyss", type: "next-prisma" },
            planning: { mode: "roadmap" as const },
            roadmap: {
              available: true,
              paths: ["docs/roadmap/README.md"],
              selectedCandidate: null,
              candidates: { items: [], total: 5, truncated: false },
              phaseGates: { items: [], total: 0, truncated: false },
              stats: { todo: 4, inProgress: 1, done: 3 },
              summary: { active: 5, done: 3, selectable: 5, hasBlocked: false },
            },
            health: "good" as const,
          };
        },
      } as unknown as LoopApplicationAssembly,
      {} as LoopApplicationProject,
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(output.some((line) => line.includes("Planning: roadmap")));
  assert.ok(output.some((line) => line.includes("4 à faire")));
  assert.ok(output.some((line) => line.includes("1 en cours")));
  assert.ok(output.some((line) => line.includes("Candidats exposés: 0/5.")));
});

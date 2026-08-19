import assert from "node:assert/strict";
import test from "node:test";

import { printRoadmapProposalContext } from "../../src/commands/proposal-context.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";

test("renders a human-readable deterministic proposal context", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printRoadmapProposalContext(
      {
        generateRoadmapProposalContextReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "loop-engine", type: "node-cli" },
            planning: { mode: "roadmap" as const },
            objective: {
              source: "docs/architecture/final-objective.md",
              available: true,
              eligibleForRoadmapProposal: true,
              content: "Canonical objective.",
            },
            context: "available" as const,
            roadmap: {
              configuredPaths: ["roadmap.md"],
              stats: { todo: 1, done: 0 },
              summary: { selectable: 1 },
              selectedCandidate: null,
              candidates: { items: [], total: 1, truncated: false },
              phaseGates: { items: [], total: 0, truncated: false },
            },
            projectState: {
              git: { branch: "main", clean: true, requiresGit: true },
              validation: [],
              health: [],
            },
          };
        },
      } as unknown as LoopApplicationAssembly,
      {} as LoopApplicationProject,
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(output.some((line) => line.includes("Planning: roadmap")));
  assert.ok(output.some((line) => line.includes("Contexte déterministe disponible.")));
  assert.ok(output.some((line) => line.includes("1 à faire")));
  assert.ok(output.some((line) => line.includes("Candidats exposés: 0/1.")));
});

test("renders maintenance as deliberately unavailable", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printRoadmapProposalContext(
      {
        generateRoadmapProposalContextReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "n8n", type: "automation" },
            planning: { mode: "maintenance" as const },
            objective: {
              source: null,
              available: false,
              eligibleForRoadmapProposal: false,
              reason: "planning_mode_maintenance" as const,
            },
            context: null,
          };
        },
      } as unknown as LoopApplicationAssembly,
      {} as LoopApplicationProject,
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(
    output.some((line) =>
      line.includes("Contexte indisponible : projet en maintenance."),
    ),
  );
  assert.equal(
    output.some((line) =>
      line.includes("aucune source d’objectif canonique configurée"),
    ),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { printProjectObjective } from "../../src/commands/objective.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";

test("renders a human-readable canonical objective", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printProjectObjective(
      {
        generateProjectObjectiveReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "loop-engine" },
            planning: { mode: "roadmap" as const },
            objective: {
              source: "docs/architecture/final-objective.md",
              available: true,
              eligibleForRoadmapProposal: true,
              content: "Canonical objective.",
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
  assert.ok(
    output.some((line) =>
      line.includes("Source: docs/architecture/final-objective.md"),
    ),
  );
  assert.ok(
    output.some((line) =>
      line.includes("Éligible à une proposition de roadmap: oui"),
    ),
  );
  assert.ok(output.some((line) => line.includes("Canonical objective.")));
});

test("renders maintenance as deliberately ineligible rather than missing", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printProjectObjective(
      {
        generateProjectObjectiveReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "n8n" },
            planning: { mode: "maintenance" as const },
            objective: {
              source: null,
              available: false,
              eligibleForRoadmapProposal: false,
              reason: "planning_mode_maintenance" as const,
            },
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
      line.includes("Proposition de roadmap indisponible : projet en maintenance."),
    ),
  );
  assert.equal(
    output.some((line) =>
      line.includes("Aucune source d’objectif canonique configurée."),
    ),
    false,
  );
});

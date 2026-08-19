import assert from "node:assert/strict";
import test from "node:test";

import { printRoadmapStatus } from "../../src/commands/roadmap.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";

test("renders a short human maintenance status without proposing work", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printRoadmapStatus(
      {
        generateRoadmapPlanningStatusReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "n8n" },
            planning: {
              mode: "maintenance" as const,
              roadmapConfigured: false,
              configuredPaths: [],
              discoveredPaths: [],
              voluntaryNoWork: true,
              recommendation: "maintenance_no_work" as const,
            },
          };
        },
      } as unknown as LoopApplicationAssembly,
      {} as LoopApplicationProject,
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(output.some((line) => line.includes("Planning: maintenance")));
  assert.ok(
    output.some((line) =>
      line.includes("Travail planifié volontairement absent."),
    ),
  );
  assert.ok(output.some((line) => line.includes("aucune action proposée")));
});

test("renders external planning without claiming that planned work is absent", () => {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => output.push(values.join(" "));

  try {
    printRoadmapStatus(
      {
        generateRoadmapPlanningStatusReport() {
          return {
            schemaVersion: 1 as const,
            project: { name: "external-project" },
            planning: {
              mode: "external" as const,
              roadmapConfigured: false,
              configuredPaths: [],
              discoveredPaths: [],
              voluntaryNoWork: true,
              recommendation: "external_planning_source" as const,
            },
          };
        },
      } as unknown as LoopApplicationAssembly,
      {} as LoopApplicationProject,
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(output.some((line) => line.includes("Planning: external")));
  assert.ok(
    output.some((line) =>
      line.includes("Planification gérée hors de Loop Engine."),
    ),
  );
  assert.equal(
    output.some((line) =>
      line.includes("Travail planifié volontairement absent."),
    ),
    false,
  );
  assert.ok(
    output.some((line) =>
      line.includes("consulter la source de pilotage externe"),
    ),
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { generateCompletionEventsReport } from "../../src/commands/completion-events.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../../src/composition/index.js";

test("aggregates completion events in project order and isolates project failures", () => {
  const config = {
    projects: [
      { name: "alpha" },
      { name: "beta" },
      { name: "gamma" },
    ],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport(project: { name: string }) {
      if (project.name === "gamma") throw new Error("boom");
      return {
        roadmap: {
          completionEvent:
            project.name === "alpha"
              ? {
                  type: "lot.completed",
                  eventId: "a".repeat(32),
                  project: { name: "alpha" },
                  candidate: { id: "A1" },
                  nextCandidate: null,
                }
              : null,
        },
      };
    },
  } as unknown as LoopApplicationAssembly;

  const report = generateCompletionEventsReport(application, config);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.events.length, 1);
  assert.deepEqual(report.events[0], {
    type: "lot.completed",
    eventId: "a".repeat(32),
    project: { name: "alpha" },
    candidate: { id: "A1" },
    nextCandidate: null,
  });
  assert.deepEqual(report.errors, [
    { project: "gamma", code: "overview_failed" },
  ]);
});

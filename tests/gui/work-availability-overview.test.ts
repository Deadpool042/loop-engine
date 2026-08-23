import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatLastRun,
  formatWorkAvailability,
} from "../../src/gui/desktop/app.js";
import type { SummaryProject } from "../../src/gui/desktop/summary-contract.js";

function project(overrides: Partial<SummaryProject> = {}): SummaryProject {
  return {
    project: { name: "loop-engine", type: "node", path: "." },
    git: { branch: "main", clean: true },
    health: "good",
    ...overrides,
  };
}

describe("work availability overview", () => {
  it("distinguishes actionable work from explicit non-actionable planning states", () => {
    assert.equal(
      formatWorkAvailability(
        project({
          workAvailability: {
            actionable: true,
            reason: "roadmap_configured",
          },
        }),
      ),
      "Travail actionnable",
    );
    assert.equal(
      formatWorkAvailability(
        project({
          workAvailability: {
            actionable: false,
            reason: "no_admissible_candidate",
          },
        }),
      ),
      "Aucun candidat roadmap admissible",
    );
    assert.equal(
      formatWorkAvailability(
        project({
          workAvailability: {
            actionable: false,
            reason: "deferred_no_work",
          },
        }),
      ),
      "Travail roadmap différé",
    );
    assert.equal(
      formatWorkAvailability(
        project({
          workAvailability: {
            actionable: false,
            reason: "external_planning_source",
          },
        }),
      ),
      "Planning géré par une source externe",
    );
  });

  it("reports the last terminal run without interpreting it as project health", () => {
    assert.equal(
      formatLastRun(
        project({
          lastRun: {
            status: "blocked",
            completedAt: "2026-08-23T09:00:00.000Z",
          },
        }),
      ),
      "Dernier run : bloqué · 2026-08-23T09:00:00.000Z",
    );
    assert.equal(formatLastRun(project({ lastRun: null })), "Aucun run enregistré");
    assert.equal(formatLastRun(project()), "Historique indisponible");
  });
});

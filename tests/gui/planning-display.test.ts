import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ContextDetail } from "../../src/gui/desktop/context-contract.js";
import {
  formatGitStatus,
  getPlanningDisplay,
} from "../../src/gui/desktop/planning-display.js";

function context(overrides: Partial<ContextDetail> = {}): ContextDetail {
  return {
    docs: { required: [], missing: [] },
    roadmap: {
      available: true,
      paths: ["roadmap.md"],
      phaseGates: [],
      stats: {
        total: 1,
        todo: 1,
        inProgress: 0,
        done: 0,
        unknown: 0,
        safe: 1,
        warning: 0,
        blocked: 0,
      },
      selectedCandidate: null,
    },
    validation: { configured: false, commands: [] },
    ...overrides,
  };
}

describe("GUI planning display", () => {
  it("renders maintenance without presenting a roadmap as missing", () => {
    assert.deepEqual(
      getPlanningDisplay(
        context({
          planning: {
            mode: "maintenance",
            roadmapConfigured: false,
            recommendation: "maintenance_no_work",
          },
          roadmap: {
            ...context().roadmap,
            available: false,
            paths: [],
          },
        }),
      ),
      {
        modeLabel: "Maintenance",
        heading: "Projet en maintenance",
        description: "Aucun travail planifié actuellement.",
        roadmapDetail: "Aucune roadmap requise.",
        blockedGates: [],
        showRoadmapProposalAction: false,
      },
    );
  });

  it("renders a roadmap as complete only from canonical todo: 0", () => {
    assert.deepEqual(
      getPlanningDisplay(
        context({
          planning: {
            mode: "roadmap",
            roadmapConfigured: true,
            recommendation: "no_admissible_candidate",
          },
          roadmap: {
            ...context().roadmap,
            stats: { ...context().roadmap.stats!, todo: 0, done: 45 },
          },
        }),
      ),
      {
        modeLabel: "Roadmap",
        heading: "Roadmap terminée",
        description: "Aucun travail restant.",
        blockedGates: [],
        showRoadmapProposalAction: true,
      },
    );
  });

  it("uses the prudent fallback without an explicit completion signal", () => {
    assert.deepEqual(
      getPlanningDisplay(
        context({
          planning: {
            mode: "roadmap",
            roadmapConfigured: true,
            recommendation: "no_admissible_candidate",
          },
          roadmap: { ...context().roadmap, stats: undefined },
        }),
      ),
      {
        modeLabel: "Roadmap",
        heading: "Aucun travail à lancer",
        description: "La roadmap est à jour et aucun candidat n’est admissible.",
        blockedGates: [],
        showRoadmapProposalAction: false,
      },
    );
  });

  it("surfaces closed phase gates when canonical work remains", () => {
    assert.deepEqual(
      getPlanningDisplay(
        context({
          planning: {
            mode: "roadmap",
            roadmapConfigured: true,
            recommendation: "no_admissible_candidate",
          },
          roadmap: {
            ...context().roadmap,
            stats: { ...context().roadmap.stats!, todo: 6 },
            phaseGates: [
              { phaseId: "H4", state: "closed", blockedBy: "retours-terrain-2027" },
              { phaseId: "H5", state: "closed", blockedBy: "h4-and-adr-iac" },
            ],
          },
        }),
      ),
      {
        modeLabel: "Roadmap",
        heading: "Aucun travail admissible",
        description: "Les prochaines phases sont actuellement bloquées.",
        blockedGates: [
          "H4 · retours-terrain-2027",
          "H5 · h4-and-adr-iac",
        ],
        showRoadmapProposalAction: false,
      },
    );
  });

  it("hides the roadmap proposal action outside roadmap mode even with todo: 0", () => {
    assert.equal(
      getPlanningDisplay(
        context({
          planning: {
            mode: "deferred",
            roadmapConfigured: true,
            recommendation: "no_admissible_candidate",
          },
          roadmap: {
            ...context().roadmap,
            stats: { ...context().roadmap.stats!, todo: 0 },
          },
        }),
      ).showRoadmapProposalAction,
      false,
    );
  });

  it("keeps the existing recommended-work state for an admissible candidate", () => {
    assert.equal(
      getPlanningDisplay(
        context({
          roadmap: {
            ...context().roadmap,
            selectedCandidate: {
              path: "roadmap.md",
              line: 12,
              text: "Next safe lot",
              kind: "safe",
              status: "todo",
            },
          },
        }),
      ).heading,
      "Travail recommandé",
    );
  });

  it("formats Git status without changing the Git model", () => {
    assert.equal(formatGitStatus(""), "Propre");
    assert.equal(formatGitStatus("?? .governance/"), "Non suivi uniquement");
    assert.equal(formatGitStatus(" M src/app.ts\n?? notes.md"), "Modifié");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseContextDetail } from "../../src/gui/desktop/context-contract.js";

const baseContext = {
  schemaVersion: 1,
  docs: { required: ["README.md"], missing: [] },
  roadmap: {
    available: true,
    paths: ["docs/roadmap.md"],
    phaseGates: [
      {
        phaseId: "H1",
        state: "closed",
        blockedBy: "H0-RC",
      },
    ],
    selectedCandidate: {
      id: "H1-L4",
      path: "docs/roadmap.md",
      line: 12,
      text: "Next safe lot",
      kind: "safe",
      status: "todo",
    },
  },
  validation: { configured: true, commands: ["pnpm run validate"] },
} as const;

describe("GUI context contract", () => {
  it("accepts the legacy context without planning fields", () => {
    assert.deepEqual(parseContextDetail(baseContext), {
      docs: { required: ["README.md"], missing: [] },
      roadmap: {
        available: true,
        paths: ["docs/roadmap.md"],
        phaseGates: [
          {
            phaseId: "H1",
            state: "closed",
            blockedBy: "H0-RC",
          },
        ],
        selectedCandidate: {
          id: "H1-L4",
          path: "docs/roadmap.md",
          line: 12,
          text: "Next safe lot",
          kind: "safe",
          status: "todo",
        },
      },
      validation: { configured: true, commands: ["pnpm run validate"] },
    });
  });

  it("accepts additive planning, roadmap stats, and Git status text", () => {
    const detail = parseContextDetail({
      ...baseContext,
      git: { statusText: "?? .governance/" },
      planning: {
        mode: "roadmap",
        roadmapConfigured: true,
        recommendation: "no_admissible_candidate",
      },
      roadmap: {
        ...baseContext.roadmap,
        selectedCandidate: null,
        stats: {
          total: 45,
          todo: 0,
          inProgress: 0,
          done: 45,
          unknown: 0,
          safe: 0,
          warning: 0,
          blocked: 0,
        },
      },
    });

    assert.deepEqual(detail?.git, { statusText: "?? .governance/" });
    assert.deepEqual(detail?.planning, {
      mode: "roadmap",
      roadmapConfigured: true,
      recommendation: "no_admissible_candidate",
    });
    assert.equal(detail?.roadmap.stats?.todo, 0);
  });

  it("rejects malformed rendered context fields", () => {
    assert.equal(
      parseContextDetail({
        ...baseContext,
        planning: {
          mode: "roadmap",
          roadmapConfigured: true,
          recommendation: "invented",
        },
      }),
      null,
    );
  });
});

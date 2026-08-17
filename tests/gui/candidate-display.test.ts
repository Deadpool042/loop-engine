import * as assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatCandidateState,
  formatCandidateTitle,
} from "../../src/gui/desktop/candidate-display.js";

const candidate = {
  id: "H3-L1",
  path: "docs/roadmap/projet-lp-infra.md",
  line: 122,
  text: "| H3-L1 | ADR stratégie d'observabilité | ⬜ À faire |",
  kind: "safe" as const,
  status: "todo",
  admissibility: {
    state: "admissible" as const,
    reason: "phase_open",
  },
};

test("extracts the deliverable from a structured roadmap row", () => {
  assert.equal(formatCandidateTitle(candidate), "ADR stratégie d'observabilité");
});

test("keeps non-table candidate text unchanged", () => {
  assert.equal(
    formatCandidateTitle({ ...candidate, text: "Documenter la stratégie" }),
    "Documenter la stratégie",
  );
});

test("renders user-facing admissibility and status labels", () => {
  assert.equal(formatCandidateState(candidate), "Admissible · À faire");
});

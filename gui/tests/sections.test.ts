import assert from "node:assert/strict";
import test from "node:test";

import { initialSections, isOpen, SECTION_IDS, toggleSection } from "../shared/sections.js";

test("initialSections opens only status and next (decision 12bis)", () => {
  const state = initialSections();

  assert.equal(isOpen(state, "status"), true);
  assert.equal(isOpen(state, "next"), true);
  assert.equal(isOpen(state, "context"), false);
  assert.equal(isOpen(state, "prompt"), false);
  assert.equal(isOpen(state, "review"), false);
  assert.equal(isOpen(state, "plan"), false);

  for (const id of SECTION_IDS) {
    assert.ok(id in state.open, `expected ${id} to be present in initial state`);
  }
});

test("toggleSection flips a single section without affecting the others", () => {
  const initial = initialSections();

  const afterContextOpen = toggleSection(initial, "context");
  assert.equal(isOpen(afterContextOpen, "context"), true);
  assert.equal(isOpen(afterContextOpen, "status"), true, "unrelated eager section stays open");
  assert.equal(isOpen(afterContextOpen, "prompt"), false, "unrelated lazy section stays closed");

  const afterContextClosed = toggleSection(afterContextOpen, "context");
  assert.equal(isOpen(afterContextClosed, "context"), false);
});

test("toggleSection does not mutate the input state (pure reducer)", () => {
  const initial = initialSections();
  const before = JSON.stringify(initial);

  toggleSection(initial, "plan");

  assert.equal(JSON.stringify(initial), before);
});

test("toggleSection rejects an unknown section id", () => {
  const initial = initialSections();
  assert.throws(() => toggleSection(initial, "not-a-section" as never), TypeError);
});

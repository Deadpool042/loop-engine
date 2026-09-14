import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../src/core/config.js";

function findOpenClawControl() {
  const config = loadConfig();
  const project = config.projects.find((entry) => entry.name === "openclaw-control");
  assert.ok(project, "openclaw-control must be configured in projects.yaml");
  return project;
}

test("openclaw-control uses the single canonical project validation command", () => {
  const project = findOpenClawControl();

  assert.deepEqual(project.validation, ["pnpm run validate"]);
});

test("openclaw-control keeps roadmap planning anchored on the approved brief", () => {
  const project = findOpenClawControl();

  assert.equal(project.planning?.mode, "roadmap");
  assert.equal(project.planning?.objective_source, "PROJECT-BRIEF.md");
  assert.deepEqual(project.roadmap, ["docs/roadmap/README.md"]);
});

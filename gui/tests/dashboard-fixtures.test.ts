import assert from "node:assert/strict";
import test from "node:test";

import { FIXTURE_PROJECTS } from "../shared/fixtures.js";
import { initialNav, selectProject } from "../shared/navigation.js";

test("every fixture project can be selected via the navigation state machine", () => {
  for (const project of FIXTURE_PROJECTS) {
    const nav = selectProject(initialNav(true), project.name);
    assert.deepEqual(nav.screen, { name: "project-detail", project: project.name });
  }
});

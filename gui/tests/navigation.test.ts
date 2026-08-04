import assert from "node:assert/strict";
import test from "node:test";

import { goToDashboard, goToSettings, initialNav, selectProject } from "../shared/navigation.js";

test("initialNav goes to settings when no repo path is configured", () => {
  assert.deepEqual(initialNav(false), { screen: { name: "settings" } });
});

test("initialNav goes to dashboard when a repo path is configured", () => {
  assert.deepEqual(initialNav(true), { screen: { name: "dashboard" } });
});

test("navigates dashboard -> project-detail -> dashboard -> settings", () => {
  let nav = initialNav(true);
  assert.equal(nav.screen.name, "dashboard");

  nav = selectProject(nav, "creatyss");
  assert.deepEqual(nav.screen, { name: "project-detail", project: "creatyss" });

  nav = goToDashboard(nav);
  assert.equal(nav.screen.name, "dashboard");

  nav = goToSettings(nav);
  assert.equal(nav.screen.name, "settings");
});

test("selectProject rejects an empty project name", () => {
  const nav = initialNav(true);
  assert.throws(() => selectProject(nav, ""), TypeError);
  assert.throws(() => selectProject(nav, "   "), TypeError);
});

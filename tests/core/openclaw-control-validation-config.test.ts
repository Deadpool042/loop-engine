import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../src/core/config.js";

test("retired OpenClaw Control is not registered as an active project", () => {
  const config = loadConfig();

  assert.equal(
    config.projects.some((entry) => entry.name === "openclaw-control"),
    false,
  );
});

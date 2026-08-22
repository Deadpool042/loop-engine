import assert from "node:assert/strict";
import { test } from "node:test";

import { getDisplayedAgentRoutingReasons } from "../../src/gui/desktop/app.js";

test("agent routing reasons are displayed in resolver order and capped at three", () => {
  assert.deepEqual(
    getDisplayedAgentRoutingReasons(["one", "two", "three", "four"]),
    ["one", "two", "three"],
  );
});

test("agent routing reasons keep short and empty inputs unchanged", () => {
  assert.deepEqual(getDisplayedAgentRoutingReasons(["one", "two"]), ["one", "two"]);
  assert.deepEqual(getDisplayedAgentRoutingReasons([]), []);
});

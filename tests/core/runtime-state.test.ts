import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  resolveLegacyLoopEngineStatePath,
  resolveLoopEngineStateDirectory,
} from "../../src/core/runtime-state.js";

test("runtime state prefers XDG_STATE_HOME over HOME", () => {
  assert.equal(
    resolveLoopEngineStateDirectory({
      XDG_STATE_HOME: "/tmp/loop-xdg-state",
      HOME: "/tmp/loop-home",
    }),
    resolve("/tmp/loop-xdg-state", "loop-engine"),
  );
});

test("runtime state falls back to HOME local state", () => {
  assert.equal(
    resolveLoopEngineStateDirectory({
      HOME: "/tmp/loop-home",
    }),
    resolve("/tmp/loop-home", ".local", "state", "loop-engine"),
  );
});

test("legacy state path remains repository-local only for migration reads", () => {
  assert.equal(
    resolveLegacyLoopEngineStatePath("runs", "creatyss.jsonl"),
    resolve(".loop-engine", "runs", "creatyss.jsonl"),
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { createExecutionWindowCloseGuard } from "../../src/gui/desktop/execution-window-close-guard.js";

test("blocks normal window close only while an execution invocation is active", async () => {
  const guard = createExecutionWindowCloseGuard();
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let prevented = 0;
  const running = guard.run(async () => pending);

  assert.equal(guard.active, true);
  assert.equal(guard.preventClose({ preventDefault: () => { prevented += 1; } }), true);
  release?.();
  await running;
  assert.equal(guard.active, false);
  assert.equal(guard.preventClose({ preventDefault: () => { prevented += 1; } }), false);
  assert.equal(prevented, 1);
});

test("restores normal window close after an execution failure", async () => {
  const guard = createExecutionWindowCloseGuard();
  await assert.rejects(guard.run(async () => { throw new Error("expected"); }));
  assert.equal(guard.active, false);
});

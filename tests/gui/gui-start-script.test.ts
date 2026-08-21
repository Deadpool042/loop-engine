import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("gui:start raises only its process NOFILE limit before starting Forge", () => {
  const script = readFileSync(resolve("scripts/gui-start.sh"), "utf8");
  assert.match(script, /target_limit=8192/);
  assert.match(script, /ulimit -Sn/);
  assert.match(script, /ulimit -Hn/);
  assert.match(script, /ulimit -n "\$target_limit"/);
  assert.match(script, /exec pnpm exec electron-forge start/);
  assert.doesNotMatch(script, /sudo|launchctl|kill -9/);
});

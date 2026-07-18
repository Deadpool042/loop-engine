import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWorktreeStatus } from "../../scripts/audit-release-check.js";

test("evaluateWorktreeStatus reports clean for empty git status output", () => {
  const result = evaluateWorktreeStatus("");

  assert.equal(result.clean, true);
  assert.deepEqual(result.files, []);
});

test("evaluateWorktreeStatus reports dirty for a modified tracked file", () => {
  const result = evaluateWorktreeStatus(" M docs/audits/stable-tags.md\n");

  assert.equal(result.clean, false);
  assert.deepEqual(result.files, [" M docs/audits/stable-tags.md"]);
});

test("evaluateWorktreeStatus reports dirty for an untracked file", () => {
  const result = evaluateWorktreeStatus("?? scripts/audit-release-check.ts\n");

  assert.equal(result.clean, false);
  assert.deepEqual(result.files, ["?? scripts/audit-release-check.ts"]);
});

test("evaluateWorktreeStatus reports every offending line for a mixed status", () => {
  const output =
    " M docs/audits/stable-tags.md\n?? scripts/audit-release-check.ts\n";
  const result = evaluateWorktreeStatus(output);

  assert.equal(result.clean, false);
  assert.deepEqual(result.files, [
    " M docs/audits/stable-tags.md",
    "?? scripts/audit-release-check.ts",
  ]);
});

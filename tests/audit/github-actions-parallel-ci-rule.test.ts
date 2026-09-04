import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";
import { AUDIT_GITHUB_ACTIONS_CI_RULE } from "../../src/audit/rules/github-actions-parallel-ci.js";

test("AUDIT-012 uses the consolidated CI contract in the runtime registry", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-012");

  assert.ok(registered);
  assert.equal(registered.title, AUDIT_GITHUB_ACTIONS_CI_RULE.title);
  assert.equal(
    registered.description,
    AUDIT_GITHUB_ACTIONS_CI_RULE.description,
  );
  assert.equal(registered.check().status, "pass");
});

test("consolidated CI uses one Node bootstrap and Corepack-managed pnpm", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  assert.equal(workflow.includes("pnpm/action-setup"), false);
  assert.equal(workflow.includes("cache: pnpm"), false);
  assert.equal(workflow.includes("corepack enable"), true);
  assert.equal(workflow.includes("pnpm --version"), true);
  assert.equal(workflow.includes("pnpm run ci"), true);
  assert.equal(workflow.includes("\n  typecheck:"), false);
  assert.equal(workflow.includes("\n  tests:"), false);
  assert.equal(workflow.includes("\n  audit-strict:"), false);
  assert.equal(workflow.includes("\n  audit-profiles:"), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeExecutionPlanInvariant,
  RUNTIME_EXECUTION_PLAN_ADAPTER_BOUNDARY_RULE,
  RUNTIME_EXECUTION_PLAN_COMPAT_RULE,
  RUNTIME_EXECUTION_PLAN_CONTRACT_RULE,
  RUNTIME_EXECUTION_PLAN_DOCUMENT_RULE,
  RUNTIME_EXECUTION_PLAN_DRY_RUN_RULE,
  RUNTIME_EXECUTION_PLAN_INVARIANTS,
  RUNTIME_EXECUTION_PLAN_SERIALIZABLE_RULE,
} from "../../src/audit/rules/audit.js";

const cases = [
  {
    rule: RUNTIME_EXECUTION_PLAN_CONTRACT_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.contract,
  },
  {
    rule: RUNTIME_EXECUTION_PLAN_SERIALIZABLE_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.pureData,
  },
  {
    rule: RUNTIME_EXECUTION_PLAN_DRY_RUN_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.dryRun,
  },
  {
    rule: RUNTIME_EXECUTION_PLAN_ADAPTER_BOUNDARY_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.adapterBoundary,
  },
  {
    rule: RUNTIME_EXECUTION_PLAN_COMPAT_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.compatibility,
  },
  {
    rule: RUNTIME_EXECUTION_PLAN_DOCUMENT_RULE,
    invariant: RUNTIME_EXECUTION_PLAN_INVARIANTS.documentation,
  },
] as const;

test("V13.17 Runtime Execution Plan audit rules are contiguous and pass", () => {
  assert.deepEqual(
    cases.map(({ rule }) => rule.id),
    ["AUDIT-394", "AUDIT-395", "AUDIT-396", "AUDIT-397", "AUDIT-398", "AUDIT-399"],
  );
  assert.ok(cases.every(({ rule }) => rule.check().status === "pass"));
});

for (const { rule, invariant } of cases) {
  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeExecutionPlanInvariant(source, invariant);

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-395 rejects platform effects in runtime execution plan construction", () => {
  const invariant = RUNTIME_EXECUTION_PLAN_INVARIANTS.pureData;
  const source = `${readFileSync(invariant.file, "utf8")}\nDate.now();\nconsole.log('debug');\n`;

  assert.deepEqual(
    inspectRuntimeExecutionPlanInvariant(source, invariant).forbidden,
    ["Date.now", "console."],
  );
});

test("AUDIT-396 rejects a dry-run contract that no longer builds a plan", () => {
  const invariant = RUNTIME_EXECUTION_PLAN_INVARIANTS.dryRun;
  const source = readFileSync(invariant.file, "utf8").replaceAll(
    "createRuntimeExecutionPlan",
    "removedPlanFactory",
  );

  assert.deepEqual(
    inspectRuntimeExecutionPlanInvariant(source, invariant).missing,
    ["createRuntimeExecutionPlan"],
  );
});

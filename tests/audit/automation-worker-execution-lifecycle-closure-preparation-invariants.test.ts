import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inspectAutomationOrchestratorWorkerExecutionLifecycleClosurePreparationInvariants,
  type AutomationAuditSource,
} from "../../src/audit/rules/automation-contracts.js";

const path =
  "src/automation/orchestrator/worker-execution-lifecycle-closure-preparation.ts";
const reason =
  "automation_worker_execution_lifecycle_closure_preparation_invariants_not_enforced";

function source(): string {
  return readFileSync(path, "utf8");
}

function sources(content = source()): readonly AutomationAuditSource[] {
  return Object.freeze([Object.freeze({ path, source: content })]);
}

function mutate(pattern: string, replacement: string): readonly AutomationAuditSource[] {
  const canonical = source();
  const occurrences = canonical.split(pattern).length - 1;
  assert.equal(
    occurrences,
    1,
    `expected exactly one occurrence of ${JSON.stringify(pattern)}`,
  );
  const mutated = canonical.replace(pattern, replacement);
  assert.notEqual(mutated, canonical, "mutation was not applied");
  return sources(mutated);
}

const expectedViolation = Object.freeze([{ path, reason }]);

test("AUDIT-577 accepts enforced worker execution lifecycle closure preparation invariants", () => {
  assert.deepEqual(
    inspectAutomationOrchestratorWorkerExecutionLifecycleClosurePreparationInvariants(
      sources(),
    ),
    [],
  );
});

test("AUDIT-577 rejects missing worker execution lifecycle closure preparation source", () => {
  assert.deepEqual(
    inspectAutomationOrchestratorWorkerExecutionLifecycleClosurePreparationInvariants(
      [],
    ),
    expectedViolation,
  );
});

test("AUDIT-577 rejects weakened worker execution lifecycle closure preparation invariants", () => {
  const functionTarget = "  const ids = identifiers(finalization);";
  const mutations = [
    ["return Object.freeze({", "return Object.seal({"],
    [
      "requestId: ids?.requestId ?? null,",
      "requestId: ids?.requestId.trim() ?? null,",
    ],
    [
      "delegationId: ids?.delegationId ?? null,",
      "delegationId: ids?.delegationId.toLowerCase() ?? null,",
    ],
    [
      "candidateId: ids?.candidateId ?? null,",
      "candidateId: ids?.candidateId.toUpperCase() ?? null,",
    ],
    ["requestId: ids?.requestId ?? null,", "requestId: null,"],
    ["delegationId: ids?.delegationId ?? null,", "delegationId: null,"],
    ["candidateId: ids?.candidateId ?? null,", "candidateId: null,"],
    ["targetId: ids?.targetId ?? null,", "targetId: null,"],
    ["    closureRequired,", "    closureRequired: false,"],
    [functionTarget, '  finalization.status = "mutated";\n' + functionTarget],
    [functionTarget, '  const closureId = "forbidden";\n' + functionTarget],
    [functionTarget, "  Date.now();\n" + functionTarget],
    [
      functionTarget,
      "  finalizeAutomationOrchestratorWorkerExecutionLifecycle(undefined);\n" +
        functionTarget,
    ],
    [functionTarget, "  port.prepareClosure(undefined);\n" + functionTarget],
    [functionTarget, "  setTimeout(() => undefined, 0);\n" + functionTarget],
    [functionTarget, "  retry();\n" + functionTarget],
    [functionTarget, "  publish();\n" + functionTarget],
    [
      "return Object.freeze({",
      "return Object.freeze({\n    preparedAt: Date.now(),",
    ],
  ] as const;

  for (const [pattern, replacement] of mutations) {
    assert.deepEqual(
      inspectAutomationOrchestratorWorkerExecutionLifecycleClosurePreparationInvariants(
        mutate(pattern, replacement),
      ),
      expectedViolation,
      `mutation was not rejected: ${pattern}`,
    );
  }
});

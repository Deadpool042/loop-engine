import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_BOUNDARY_RULE,
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_CORE_EXPORT_RULE,
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_DOCUMENT_RULE,
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS,
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MAPPING_RULE,
  DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MODULE_RULE,
  inspectDeclarativeRuntimeExecutionBridgeInvariant,
} from "../../src/audit/rules/audit.js";

const cases = [
  {
    rule: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MODULE_RULE,
    invariant: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.module,
  },
  {
    rule: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_BOUNDARY_RULE,
    invariant: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.pureBoundary,
  },
  {
    rule: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MAPPING_RULE,
    invariant: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.mapping,
  },
  {
    rule: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_CORE_EXPORT_RULE,
    invariant: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.coreExports,
  },
  {
    rule: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_DOCUMENT_RULE,
    invariant: DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.documentation,
  },
] as const;

test("V13.15 Declarative Runtime execution bridge audit rules are contiguous and pass", () => {
  assert.deepEqual(
    cases.map(({ rule }) => rule.id),
    ["AUDIT-384", "AUDIT-385", "AUDIT-386", "AUDIT-387", "AUDIT-388"],
  );
  assert.ok(cases.every(({ rule }) => rule.check().status === "pass"));
});

for (const { rule, invariant } of cases) {
  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectDeclarativeRuntimeExecutionBridgeInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-385 rejects duplicated adapter execution and implicit platform effects", () => {
  const invariant =
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.pureBoundary;
  const source = `${readFileSync(invariant.file, "utf8")}\nadapter.execute(request);\nDate.now();`;

  assert.deepEqual(
    inspectDeclarativeRuntimeExecutionBridgeInvariant(source, invariant)
      .forbidden,
    ["adapter.execute", "Date.now"],
  );
});

test("AUDIT-386 rejects implicit runtime association conventions", () => {
  const invariant = DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.mapping;
  const source = `${readFileSync(invariant.file, "utf8")}\nvalue instanceof RuntimeAdapter;\n`;

  assert.deepEqual(
    inspectDeclarativeRuntimeExecutionBridgeInvariant(source, invariant)
      .forbidden,
    ["instanceof"],
  );
});

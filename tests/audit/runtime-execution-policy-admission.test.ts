import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  inspectRuntimeExecutionPolicyAdmissionInvariant,
  RUNTIME_EXECUTION_POLICY_ADMISSION_COMPAT_RULE,
  RUNTIME_EXECUTION_POLICY_ADMISSION_DOCUMENT_RULE,
  RUNTIME_EXECUTION_POLICY_ADMISSION_GATE_RULE,
  RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS,
  RUNTIME_EXECUTION_POLICY_ADMISSION_MODULE_RULE,
  RUNTIME_EXECUTION_POLICY_ADMISSION_POLICY_REUSE_RULE,
} from "../../src/audit/rules/audit.js";

const cases = [
  {
    rule: RUNTIME_EXECUTION_POLICY_ADMISSION_MODULE_RULE,
    invariant: RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.admission,
  },
  {
    rule: RUNTIME_EXECUTION_POLICY_ADMISSION_GATE_RULE,
    invariant: RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.policyAwareBridge,
  },
  {
    rule: RUNTIME_EXECUTION_POLICY_ADMISSION_POLICY_REUSE_RULE,
    invariant: RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.policyReuse,
  },
  {
    rule: RUNTIME_EXECUTION_POLICY_ADMISSION_COMPAT_RULE,
    invariant: RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.publicCompatibility,
  },
  {
    rule: RUNTIME_EXECUTION_POLICY_ADMISSION_DOCUMENT_RULE,
    invariant: RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.documentation,
  },
] as const;

test("V13.16 Runtime execution policy admission audit rules are contiguous and pass", () => {
  assert.deepEqual(
    cases.map(({ rule }) => rule.id),
    ["AUDIT-389", "AUDIT-390", "AUDIT-391", "AUDIT-392", "AUDIT-393"],
  );
  assert.ok(cases.every(({ rule }) => rule.check().status === "pass"));
});

for (const { rule, invariant } of cases) {
  test(`${rule.id} rejects a fixture missing a required invariant`, () => {
    const source = readFileSync(invariant.file, "utf8").replaceAll(
      invariant.requiredTokens[0],
      "removed-invariant",
    );
    const result = inspectRuntimeExecutionPolicyAdmissionInvariant(
      source,
      invariant,
    );

    assert.deepEqual(result.missing, [invariant.requiredTokens[0]]);
  });
}

test("AUDIT-389 rejects platform effects in runtime execution admission", () => {
  const invariant = RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.admission;
  const source = `${readFileSync(invariant.file, "utf8")}\nfetch('https://example.test');\nDate.now();`;

  assert.deepEqual(
    inspectRuntimeExecutionPolicyAdmissionInvariant(source, invariant)
      .forbidden,
    ["fetch(", "Date.now"],
  );
});

test("AUDIT-391 rejects implicit policy defaults and local policy resolution", () => {
  const invariant = RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.policyReuse;
  const source = `${readFileSync(invariant.file, "utf8")}\nDEFAULT_AGENT_POLICY;\nresolvePolicy(input);\n`;

  assert.deepEqual(
    inspectRuntimeExecutionPolicyAdmissionInvariant(source, invariant)
      .forbidden,
    ["DEFAULT_AGENT_POLICY", "resolvePolicy("],
  );
});

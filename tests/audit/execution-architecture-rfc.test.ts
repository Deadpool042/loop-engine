import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXECUTION_ARCHITECTURE_RFC_BOUNDARY_RULE,
  EXECUTION_ARCHITECTURE_RFC_EXISTS_RULE,
  EXECUTION_ARCHITECTURE_RFC_INVARIANTS_RULE,
  EXECUTION_ARCHITECTURE_RFC_LAYERS_RULE,
  EXECUTION_ARCHITECTURE_RFC_RESPONSIBILITY_RULE,
  EXECUTION_ARCHITECTURE_RFC_ROADMAP_NON_GOALS_RULE,
  EXECUTION_ARCHITECTURE_RFC_STATE_MACHINE_RULE,
  EXECUTION_ARCHITECTURE_RFC_THREAT_SECURITY_RULE,
} from "../../src/audit/rules/audit.js";

const EXECUTION_ARCHITECTURE_RFC_RULES = [
  EXECUTION_ARCHITECTURE_RFC_EXISTS_RULE,
  EXECUTION_ARCHITECTURE_RFC_LAYERS_RULE,
  EXECUTION_ARCHITECTURE_RFC_RESPONSIBILITY_RULE,
  EXECUTION_ARCHITECTURE_RFC_BOUNDARY_RULE,
  EXECUTION_ARCHITECTURE_RFC_STATE_MACHINE_RULE,
  EXECUTION_ARCHITECTURE_RFC_INVARIANTS_RULE,
  EXECUTION_ARCHITECTURE_RFC_THREAT_SECURITY_RULE,
  EXECUTION_ARCHITECTURE_RFC_ROADMAP_NON_GOALS_RULE,
] as const;

describe("execution architecture RFC audit rules", () => {
  it("covers the V13.0 RFC with contiguous deterministic checks", () => {
    assert.deepEqual(
      EXECUTION_ARCHITECTURE_RFC_RULES.map((rule) => rule.id),
      [
        "AUDIT-286",
        "AUDIT-287",
        "AUDIT-288",
        "AUDIT-289",
        "AUDIT-290",
        "AUDIT-291",
        "AUDIT-292",
        "AUDIT-293",
      ],
    );
    assert.deepEqual(
      EXECUTION_ARCHITECTURE_RFC_RULES.map((rule) => rule.category),
      [
        "architecture",
        "docs",
        "architecture",
        "architecture",
        "docs",
        "architecture",
        "docs",
        "docs",
      ],
    );
    assert.ok(
      EXECUTION_ARCHITECTURE_RFC_RULES.every(
        (rule) => rule.check().status === "pass",
      ),
    );
  });
});

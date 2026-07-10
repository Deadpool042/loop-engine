import assert from "node:assert/strict";
import test from "node:test";

import { buildAuditRecommendations } from "../src/audit/recommendations.js";
import type { AuditFinding } from "../src/audit/types.js";

const baseFinding = {
  ruleId: "AUDIT-999",
  category: "architecture",
  severity: "warning",
  status: "pass",
  priority: "low",
  message: "test finding",
} satisfies AuditFinding;

test("buildAuditRecommendations extracts actionable finding recommendations", () => {
  const findings: readonly AuditFinding[] = [
    {
      ...baseFinding,
      ruleId: "AUDIT-998",
      priority: "medium",
      status: "fail",
      recommendation: "Fix the failing audit rule.",
    },
    {
      ...baseFinding,
      ruleId: "AUDIT-997",
      message: "passed finding without recommendation",
    },
  ];

  assert.deepEqual(buildAuditRecommendations(findings), [
    {
      ruleId: "AUDIT-998",
      priority: "medium",
      message: "Fix the failing audit rule.",
    },
  ]);
});

test("buildAuditRecommendations returns an empty list when no findings are actionable", () => {
  const findings: readonly AuditFinding[] = [
    {
      ...baseFinding,
      ruleId: "AUDIT-996",
    },
  ];

  assert.deepEqual(buildAuditRecommendations(findings), []);
});

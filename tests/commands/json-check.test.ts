import assert from "node:assert/strict";
import test from "node:test";

import { validateAuditJsonPayload } from "../../src/commands/json-check.js";

test("validateAuditJsonPayload rejects mismatched recommendation summary counts", () => {
  const payload = {
    schemaVersion: 1,
    generatedAt: "2026-07-10T00:00:00.000Z",
    summary: {
      status: "fail",
      total: 1,
      pass: 0,
      warning: 0,
      fail: 1,
      skipped: 0,
      score: 0,
      byCategory: {
        architecture: 1,
      },
      byPriority: {
        medium: 1,
      },
      recommendationsByPriority: {
        medium: 1,
      },
      recommendations: {
        total: 1,
        byPriority: {
          medium: 2,
        },
      },
    },
    findings: [
      {
        ruleId: "AUDIT-999",
        category: "architecture",
        severity: "warning",
        status: "fail",
        priority: "medium",
        message: "Example failing finding.",
        recommendation: "Fix the example failing finding.",
      },
    ],
    recommendations: [
      {
        ruleId: "AUDIT-999",
        priority: "medium",
        message: "Fix the example failing finding.",
      },
    ],
  };

  payload.summary.recommendationsByPriority.medium = 1;
  payload.summary.recommendations.byPriority.medium = 2;

  assert.throws(
    () => validateAuditJsonPayload(payload),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "summary.recommendations.byPriority must match summary.recommendationsByPriority",
      );
      return true;
    },
  );
});
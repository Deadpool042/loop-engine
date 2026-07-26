import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuditRuleManifest } from "../../src/audit/registry.js";
import {
  inspectRuntimeAuditManifestConsistency,
  RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE,
} from "../../src/audit/rules/runtime-audit-manifest-consistency.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";
import type { AuditRule } from "../../src/audit/types.js";

test("AUDIT-425 protects Runtime audit manifest consistency", () => {
  assert.equal(RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE.id, "AUDIT-425");
  assert.equal(RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE.check().status, "pass");
});

test("AUDIT-425 is registered after AUDIT-424 with complete metadata", () => {
  const audit424Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-424");
  const audit425Index = AUDIT_RULES.findIndex((rule) => rule.id === "AUDIT-425");
  const audit425 = AUDIT_RULES[audit425Index];

  assert.notEqual(audit424Index, -1);
  assert.equal(audit425Index, audit424Index + 1);
  assert.ok(audit425);
  assert.equal(audit425.metadata.introducedIn, "V13.84");
  assert.deepEqual(audit425.metadata.dependsOn, ["AUDIT-424"]);
  assert.equal(audit425.metadata.stability, "stable");
});

test("a valid normalized inventory produces a consistent manifest", () => {
  const manifest = createAuditRuleManifest(AUDIT_RULES);
  const report = inspectRuntimeAuditManifestConsistency(AUDIT_RULES, manifest);

  assert.equal(report.consistent, true);
  assert.deepEqual(report.missingIds, []);
  assert.deepEqual(report.duplicateIds, []);
  assert.deepEqual(report.unexpectedIds, []);
  assert.deepEqual(report.orderMismatches, []);
});

function makeRule(id: string): AuditRule {
  return {
    id,
    category: "architecture",
    severity: "error",
    title: `Fixture rule ${id}`,
    description: "Fixture rule for AUDIT-425 regression tests.",
    metadata: {
      introducedIn: null,
      tags: ["architecture"],
      stability: "stable",
      dependsOn: [],
    },
    check: () => {
      throw new Error("Fixture rule check must not be invoked.");
    },
  };
}

test("a manifest missing a rule is detected", () => {
  const rules = [makeRule("AUDIT-900"), makeRule("AUDIT-901")];
  const fullManifest = createAuditRuleManifest(rules);
  const manifest = {
    ...fullManifest,
    rules: fullManifest.rules.filter((entry) => entry.id !== "AUDIT-901"),
  };

  const report = inspectRuntimeAuditManifestConsistency(rules, manifest);

  assert.equal(report.consistent, false);
  assert.deepEqual(report.missingIds, ["AUDIT-901"]);
});

test("a manifest with a duplicated rule is detected", () => {
  const rules = [makeRule("AUDIT-900"), makeRule("AUDIT-901")];
  const fullManifest = createAuditRuleManifest(rules);
  const manifest = {
    ...fullManifest,
    rules: [...fullManifest.rules, fullManifest.rules[0]],
  };

  const report = inspectRuntimeAuditManifestConsistency(rules, manifest);

  assert.equal(report.consistent, false);
  assert.deepEqual(report.duplicateIds, ["AUDIT-900"]);
});

test("a manifest with an unexpected rule is detected", () => {
  const rules = [makeRule("AUDIT-900"), makeRule("AUDIT-901")];
  const fullManifest = createAuditRuleManifest(rules);
  const extraManifest = createAuditRuleManifest([makeRule("AUDIT-902")]);
  const manifest = {
    ...fullManifest,
    rules: [...fullManifest.rules, ...extraManifest.rules],
  };

  const report = inspectRuntimeAuditManifestConsistency(rules, manifest);

  assert.equal(report.consistent, false);
  assert.deepEqual(report.unexpectedIds, ["AUDIT-902"]);
});

test("a manifest with unstable ordering relative to the normalized inventory is detected", () => {
  const rules = [makeRule("AUDIT-900"), makeRule("AUDIT-901"), makeRule("AUDIT-902")];
  const fullManifest = createAuditRuleManifest(rules);
  const manifest = {
    ...fullManifest,
    rules: [fullManifest.rules[1], fullManifest.rules[0], fullManifest.rules[2]],
  };

  const report = inspectRuntimeAuditManifestConsistency(rules, manifest);

  assert.equal(report.consistent, false);
  assert.equal(report.orderMismatches.length, 1);
});

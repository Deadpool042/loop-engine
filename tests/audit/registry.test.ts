import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuditRuleManifest,
  createAuditRuleRegistry,
  selectAuditRules,
} from "../../src/audit/registry.js";
import { AUDIT_RULES } from "../../src/audit/rules.js";
import type { AuditRuleDefinition } from "../../src/audit/types.js";

const definition: AuditRuleDefinition = {
  id: "TEST-001",
  category: "tests",
  severity: "warning",
  title: "Test rule",
  description: "Test rule description.",
  check: () => ({
    ruleId: "TEST-001",
    category: "tests",
    severity: "warning",
    status: "pass",
    priority: "low",
    message: "pass",
  }),
};

describe("audit rule registry", () => {
  it("normalizes legacy metadata without inventing a historical version", () => {
    const [rule] = createAuditRuleRegistry([definition]);
    assert.equal(rule?.metadata.introducedIn, null);
    assert.equal(rule?.metadata.stability, "stable");
    assert.deepEqual(rule?.metadata.dependsOn, []);
  });

  it("rejects invalid metadata and dependencies", () => {
    assert.throws(() =>
      createAuditRuleRegistry([
        { ...definition, metadata: { tags: ["unknown" as never] } },
      ]),
    );
    assert.throws(() =>
      createAuditRuleRegistry([
        { ...definition, metadata: { dependsOn: ["TEST-001"] } },
      ]),
    );
    assert.throws(() =>
      createAuditRuleRegistry([
        { ...definition, metadata: { dependsOn: ["MISSING-001"] } },
      ]),
    );
  });

  it("intersects filter dimensions while preserving registry order", () => {
    const filtered = selectAuditRules(AUDIT_RULES, {
      tags: ["json", "architecture"],
      stabilities: ["stable"],
    });
    assert.ok(filtered.length > 0);
    assert.deepEqual(filtered, AUDIT_RULES.filter((rule) => filtered.includes(rule)));
  });

  it("builds a deterministic manifest directly from the registry", () => {
    const first = JSON.stringify(createAuditRuleManifest(AUDIT_RULES));
    const second = JSON.stringify(createAuditRuleManifest(AUDIT_RULES));
    assert.equal(first, second);
    const manifest = JSON.parse(first) as { rules: readonly { id: string }[] };
    assert.deepEqual(
      manifest.rules.map((rule) => rule.id),
      AUDIT_RULES.map((rule) => rule.id),
    );
  });
});

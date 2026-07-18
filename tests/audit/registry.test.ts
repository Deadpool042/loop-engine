import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuditRuleManifest,
  createAuditRuleRegistry,
  selectAuditRules,
} from "../../src/audit/registry.js";
import {
  AUDIT_RULE_DEPENDENCY_VALIDITY_V8_RULE,
  AUDIT_RULE_MANIFEST_CONSISTENCY_V8_RULE,
  AUDIT_RULE_METADATA_COMPLETENESS_V8_RULE,
  AUDIT_RULE_NO_SELF_DEPENDENCY_V8_RULE,
  AUDIT_RULE_STABILITY_VALIDITY_V8_RULE,
  AUDIT_RULE_TAG_VALIDITY_V8_RULE,
} from "../../src/audit/rules/audit.js";
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

  it("emits distinct stable diagnostics for V8 registry self-audit rules", () => {
    const findings = [
      AUDIT_RULE_METADATA_COMPLETENESS_V8_RULE,
      AUDIT_RULE_TAG_VALIDITY_V8_RULE,
      AUDIT_RULE_STABILITY_VALIDITY_V8_RULE,
      AUDIT_RULE_DEPENDENCY_VALIDITY_V8_RULE,
      AUDIT_RULE_NO_SELF_DEPENDENCY_V8_RULE,
      AUDIT_RULE_MANIFEST_CONSISTENCY_V8_RULE,
    ].map((rule) => rule.check());

    const messages = findings.map((finding) => finding.message);

    assert.ok(findings.every((finding) => finding.status === "pass"));
    assert.deepEqual(messages, [
      "Audit rule metadata is complete and normalized.",
      "Audit rule tags are validated against the typed tag registry.",
      "Audit rule stability is validated against the typed stability registry.",
      "Audit rule dependencies reference registered rules.",
      "Audit rules cannot declare self-dependencies.",
      "Audit rule manifest follows registry order and metadata.",
    ]);
    assert.equal(new Set(messages).size, messages.length);
  });
});

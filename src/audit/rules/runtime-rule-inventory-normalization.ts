import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

export type RuntimeRuleInventoryNormalizationInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_RULE_INVENTORY_NORMALIZATION_INVARIANTS = Object.freeze({
  compositeInventory: Object.freeze({
    file: "src/audit/runtime-rules.ts",
    requiredTokens: Object.freeze([
      'import { createAuditRuleRegistry } from "./registry.js";',
      "export const AUDIT_RULES = createAuditRuleRegistry([",
      "...BASE_AUDIT_RULES,",
      "registerAuditRulesForIntegrityCheck(AUDIT_RULES);",
    ]),
    forbiddenTokens: Object.freeze([
      "export const AUDIT_RULES = Object.freeze([",
      "satisfies readonly AuditRuleDefinition[]",
      'import type { AuditRuleDefinition } from "./types.js";',
    ]),
  }),
  runnerBoundary: Object.freeze({
    file: "src/audit/runner.ts",
    requiredTokens: Object.freeze([
      'import { AUDIT_RULES } from "./runtime-rules.js";',
      "selectAuditRulesForProfile(options.profile, AUDIT_RULES)",
      "selectAuditRules(profileRules, options.selection)",
    ]),
    forbiddenTokens: Object.freeze([]),
  }),
  coreManifestBoundary: Object.freeze({
    file: "src/core/audit.ts",
    requiredTokens: Object.freeze([
      'import { AUDIT_RULES } from "../audit/runtime-rules.js";',
      "selectAuditRulesForProfile(options.profile, AUDIT_RULES)",
      "selectAuditRules(profileRules, options.selection)",
      "createAuditRuleManifest(rules)",
    ]),
    forbiddenTokens: Object.freeze([]),
  }),
}) satisfies Readonly<Record<string, RuntimeRuleInventoryNormalizationInvariant>>;

export function inspectRuntimeRuleInventoryNormalizationInvariant(
  source: string,
  invariant: RuntimeRuleInventoryNormalizationInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      invariant.requiredTokens.filter((token) => !sourceIncludesToken(source, token)),
    ),
    forbidden: Object.freeze(
      invariant.forbiddenTokens.filter((token) => sourceIncludesToken(source, token)),
    ),
  });
}

export const RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-424",
    category: "architecture",
    severity: "error",
    title: "Runtime audit inventory is normalized before selectors and manifests",
    description:
      "The composite Runtime audit inventory must pass through createAuditRuleRegistry so downstream consumers receive complete AuditRule metadata.",
    metadata: {
      introducedIn: "V13.83",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-423"],
    },
    check: () => {
      const details: string[] = [];
      const files: string[] = [];

      for (const invariant of Object.values(
        RUNTIME_RULE_INVENTORY_NORMALIZATION_INVARIANTS,
      )) {
        files.push(invariant.file);
        const source = existsSync(invariant.file)
          ? readFileSync(invariant.file, "utf8")
          : "";
        const result = inspectRuntimeRuleInventoryNormalizationInvariant(
          source,
          invariant,
        );
        details.push(
          ...result.missing.map(
            (token) => `${invariant.file} -> missing: ${token}`,
          ),
          ...result.forbidden.map(
            (token) => `${invariant.file} -> forbidden: ${token}`,
          ),
        );
      }

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Restore createAuditRuleRegistry at the composite runtime inventory boundary before selectors or manifests consume AUDIT_RULES.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze(files));
    },
  };

  return rule;
})();

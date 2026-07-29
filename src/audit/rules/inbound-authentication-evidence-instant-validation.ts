import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/validation.ts";

const REQUIRED = Object.freeze([
  "const validFrom = Date.parse(evidence.validFrom);",
  "const expiresAt = Date.parse(evidence.expiresAt);",
  "Number.isNaN(validFrom)",
  "Number.isNaN(expiresAt)",
  "validFrom > expiresAt",
]);

export function inspectInboundAuthenticationEvidenceInstantValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_EVIDENCE_INSTANT_VALIDATION_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-490",
      category: "architecture",
      severity: "error",
      title:
        "Inbound authentication evidence validity bounds are parseable instants",
      description:
        "The V14.1h authentication boundary must reject malformed validFrom or expiresAt values before evidence can reach Core temporal comparisons.",
      metadata: {
        introducedIn: "V14.1h",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-489"],
      },
      check: () => {
        const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
        const result =
          inspectInboundAuthenticationEvidenceInstantValidationInvariant(source);
        const details = result.missing.map(
          (token) => `${FILE} -> missing: ${token}`,
        );

        return details.length > 0
          ? fail(rule, `${rule.title}.`, details)
          : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
      },
    };

    return rule;
  })();

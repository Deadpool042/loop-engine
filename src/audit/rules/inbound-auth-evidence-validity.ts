import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "isEvidenceNotYetValid(",
  '"authentication_not_yet_valid"',
  "isEvidenceExpired(",
  '"authentication_expired"',
]);

export function inspectInboundAuthEvidenceValidityInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTH_EVIDENCE_VALIDITY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-446",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication evidence validity is enforced",
    description:
      "The V14.0k authentication boundary must reject not-yet-valid and expired authentication evidence.",
    metadata: {
      introducedIn: "V14.0k",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-445"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthEvidenceValidityInvariant(source);
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

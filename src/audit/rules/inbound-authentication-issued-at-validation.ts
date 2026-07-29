import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/validation.ts";

const REQUIRED = Object.freeze([
  "const issuedAt = Date.parse(evidence.issuedAt);",
  "Number.isNaN(issuedAt)",
]);

export function inspectInboundAuthenticationIssuedAtValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_ISSUED_AT_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-492",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication evidence issuedAt is a parseable instant",
    description:
      "The V14.1i authentication boundary must reject malformed issuedAt values before verified evidence can reach Core.",
    metadata: {
      introducedIn: "V14.1i",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-491"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthenticationIssuedAtValidationInvariant(source);
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

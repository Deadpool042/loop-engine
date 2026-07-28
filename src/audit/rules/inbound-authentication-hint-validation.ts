import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";

const REQUIRED = Object.freeze([
  "!isNonEmptyString(descriptors.issuerHint.value)",
  "!isNonEmptyString(descriptors.subjectHint.value)",
]);

export function inspectInboundAuthenticationHintValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_HINT_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-480",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication hints reject present-but-blank values",
    description:
      "The V14.1c authentication input guard must reject a present issuerHint or subjectHint that is empty or whitespace-only, while still accepting null.",
    metadata: {
      introducedIn: "V14.1c",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-479"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthenticationHintValidationInvariant(source);
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

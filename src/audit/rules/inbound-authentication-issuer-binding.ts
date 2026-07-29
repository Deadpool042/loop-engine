import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.authenticationInput.issuerHint !== null",
  "input.authenticationInput.issuerHint !== verification.evidence.issuerId",
  '"verification_invalid"',
]);

export function inspectInboundAuthenticationIssuerBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_ISSUER_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-486",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication issuer hint is bound to the verified evidence issuerId",
    description:
      "The V14.1f authentication boundary must reject a non-null authenticationInput.issuerHint that does not exactly match the verified evidence.issuerId.",
    metadata: {
      introducedIn: "V14.1f",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-485"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthenticationIssuerBindingInvariant(source);
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

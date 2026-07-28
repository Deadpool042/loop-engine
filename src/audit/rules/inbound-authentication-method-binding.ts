import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.authenticationInput.method !== verification.evidence.method",
  '"verification_invalid"',
]);

export function inspectInboundAuthenticationMethodBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_METHOD_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-482",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication method is bound to the verified evidence method",
    description:
      "The V14.1d authentication boundary must reject a verified evidence whose method does not exactly match the declared authenticationInput.method.",
    metadata: {
      introducedIn: "V14.1d",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-481"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthenticationMethodBindingInvariant(source);
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

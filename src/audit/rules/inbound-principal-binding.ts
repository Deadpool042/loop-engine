import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "principal.principalId !== verification.evidence.subjectId",
  "principal.principalId !== input.security.accessRequest.principalId",
  '"principal_mismatch"',
]);

export function inspectInboundPrincipalBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_PRINCIPAL_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-442",
    category: "architecture",
    severity: "error",
    title: "Inbound principal stays bound to authentication evidence",
    description:
      "The V14.0i authentication boundary must fail closed when the resolved principal disagrees with authentication evidence or the access request.",
    metadata: {
      introducedIn: "V14.0i",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-441"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundPrincipalBindingInvariant(source);
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

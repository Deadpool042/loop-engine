import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "principal === null",
  "indeterminateInboundSecurity(",
  '"insufficient_evidence"',
]);

export function inspectInboundPrincipalPresenceInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_PRINCIPAL_PRESENCE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-444",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication requires a resolved principal",
    description:
      "The V14.0j authentication boundary must return insufficient evidence when authentication succeeds without a resolved principal.",
    metadata: {
      introducedIn: "V14.0j",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-443"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundPrincipalPresenceInvariant(source);
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

import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "principal.tenantId !== input.security.accessRequest.tenantId",
  '"tenant_mismatch"',
]);

export function inspectInboundTenantBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_TENANT_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-448",
    category: "architecture",
    severity: "error",
    title: "Inbound principal stays bound to the request tenant",
    description:
      "The V14.0l authentication boundary must reject a principal whose tenant disagrees with the inbound access request.",
    metadata: {
      introducedIn: "V14.0l",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-447"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundTenantBindingInvariant(source);
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

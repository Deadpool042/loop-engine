import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.security.accessRequest.project !== decoded.request.project",
  '"project_mismatch"',
]);

export function inspectInboundProjectBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_PROJECT_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-458",
    category: "architecture",
    severity: "error",
    title: "Inbound project stays bound to the decoded public request",
    description:
      "The V14.0q authentication boundary must reject an inbound access request whose project disagrees with the decoded public request project.",
    metadata: {
      introducedIn: "V14.0q",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-457"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundProjectBindingInvariant(source);
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

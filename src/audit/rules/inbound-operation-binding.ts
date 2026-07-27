import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "decodeLoopRuntimePublicRequest(input.payload)",
  "input.security.accessRequest.operation !== decoded.request.mode",
  '"operation_mismatch"',
]);

export function inspectInboundOperationBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_OPERATION_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-450",
    category: "architecture",
    severity: "error",
    title: "Inbound operation stays bound to the decoded public request",
    description:
      "The V14.0m authentication boundary must reject an inbound access operation that disagrees with the decoded public request mode.",
    metadata: {
      introducedIn: "V14.0m",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-449"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundOperationBindingInvariant(source);
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

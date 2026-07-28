import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUEST_ID_VALIDATION =
  "isInvalidRequestId(input.security.accessRequest.requestId)";
const IDENTITY_COMPARISON =
  "input.verificationContext.requestId !== input.security.accessRequest.requestId";

export function inspectInboundRequestIdValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const requestIdValidationIndex = source.indexOf(REQUEST_ID_VALIDATION);
  const identityComparisonIndex = source.indexOf(IDENTITY_COMPARISON);

  return Object.freeze({
    ordered:
      requestIdValidationIndex !== -1 &&
      identityComparisonIndex !== -1 &&
      requestIdValidationIndex < identityComparisonIndex,
  });
}

export const INBOUND_REQUEST_ID_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-477",
    category: "architecture",
    severity: "error",
    title: "Inbound requestId validation precedes the request identity comparison",
    description:
      "The V14.0z authentication boundary must validate that accessRequest.requestId is well-formed before comparing it against verificationContext.requestId.",
    metadata: {
      introducedIn: "V14.0z",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-476"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundRequestIdValidationGateInvariant(source);

      const details = result.ordered
        ? []
        : [`${FILE} -> invalid requestId validation gate ordering`];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "isInvalidEvaluationTime(input.evaluatedAt)",
  '"evaluation_time_mismatch"',
]);

export function inspectInboundEvaluationTimeValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_EVALUATION_TIME_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-474",
    category: "architecture",
    severity: "error",
    title: "Inbound evaluationTime is validated before any temporal comparison",
    description:
      "The V14.0y authentication boundary must reject an evaluatedAt that is not a well-formed instant before it is used by any evidence-window or replay comparison.",
    metadata: {
      introducedIn: "V14.0y",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-473"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundEvaluationTimeValidationInvariant(source);
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

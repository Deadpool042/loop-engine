import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.verificationContext.evaluatedAt !== input.evaluatedAt",
  '"evaluation_time_mismatch"',
]);

export function inspectInboundVerificationEvaluationTimeBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-466",
    category: "architecture",
    severity: "error",
    title: "Inbound verification evaluation time stays bound to the Core instant",
    description:
      "The V14.0u authentication boundary must reject a mismatch between verificationContext.evaluatedAt and the Core-supplied evaluatedAt before any time-dependent invariant.",
    metadata: {
      introducedIn: "V14.0u",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-465"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundVerificationEvaluationTimeBindingInvariant(source);
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

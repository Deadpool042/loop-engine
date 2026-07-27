import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound.ts";

const REQUIRED = Object.freeze([
  '"evaluation_time_mismatch"',
  "verificationContextEvaluatedAt",
  "envelope.evaluatedAt !== verificationContextEvaluatedAt",
]);

export function inspectInboundEvaluationTimeCoherenceInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_EVALUATION_TIME_COHERENCE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-438",
    category: "architecture",
    severity: "error",
    title: "Inbound evaluation time stays coherent",
    description:
      "The V14.0g inbound boundary must fail closed when the envelope evaluation time differs from the authentication verification context evaluation time.",
    metadata: {
      introducedIn: "V14.0g",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-437"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundEvaluationTimeCoherenceInvariant(source);
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

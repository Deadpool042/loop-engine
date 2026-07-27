import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound.ts";

const MISMATCH = 'return invalid("evaluation_time_mismatch")';
const AUTH = "verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(";

export function inspectInboundEvaluationTimeCoherenceGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; authenticationCallCount: number }> {
  const mismatchIndex = source.indexOf(MISMATCH);
  const authenticationIndex = source.indexOf(AUTH);

  return Object.freeze({
    ordered:
      mismatchIndex !== -1 &&
      authenticationIndex !== -1 &&
      mismatchIndex < authenticationIndex,
    authenticationCallCount: source.split(AUTH).length - 1,
  });
}

export const INBOUND_EVALUATION_TIME_COHERENCE_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-439",
    category: "architecture",
    severity: "error",
    title: "Inbound evaluation time is checked before authentication",
    description:
      "The V14.0g inbound handler must reject evaluation-time mismatch before invoking the authentication preparation facade.",
    metadata: {
      introducedIn: "V14.0g",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-438"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundEvaluationTimeCoherenceGateInvariant(source);

      const details = [
        ...(result.ordered ? [] : [`${FILE} -> invalid coherence gate ordering`]),
        ...(result.authenticationCallCount === 1
          ? []
          : [
              `${FILE} -> authentication facade call count: ${result.authenticationCallCount}`,
            ]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

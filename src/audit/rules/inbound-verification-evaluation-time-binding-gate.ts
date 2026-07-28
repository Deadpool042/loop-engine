import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const TIME_BINDING = "input.verificationContext.evaluatedAt !== input.evaluatedAt";
const EVIDENCE_NOT_YET_VALID = "isEvidenceNotYetValid(";

export function inspectInboundVerificationEvaluationTimeBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const timeBindingIndex = source.indexOf(TIME_BINDING);
  const evidenceNotYetValidIndex = source.indexOf(EVIDENCE_NOT_YET_VALID);

  return Object.freeze({
    ordered:
      timeBindingIndex !== -1 &&
      evidenceNotYetValidIndex !== -1 &&
      timeBindingIndex < evidenceNotYetValidIndex,
  });
}

export const INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-467",
    category: "architecture",
    severity: "error",
    title: "Inbound verification evaluation-time binding precedes evidence validity",
    description:
      "The V14.0u authentication boundary must validate verificationContext/Core evaluation-time binding before checking authentication evidence validity, so every downstream time-dependent invariant uses a single coherent instant.",
    metadata: {
      introducedIn: "V14.0u",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-466"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundVerificationEvaluationTimeBindingGateInvariant(source);

      const details = result.ordered
        ? []
        : [`${FILE} -> invalid evaluation-time binding gate ordering`];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

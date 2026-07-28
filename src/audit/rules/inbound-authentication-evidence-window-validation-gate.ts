import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";

const WINDOW_VALIDATION =
  "isInvalidAuthenticationEvidenceWindow(descriptors.evidence.value)";
const VERIFIED_SUCCESS = "verified: true as const,\n    evidence: descriptors.evidence.value,";

export function inspectInboundAuthenticationEvidenceWindowValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const windowValidationIndex = source.indexOf(WINDOW_VALIDATION);
  const verifiedSuccessIndex = source.indexOf(VERIFIED_SUCCESS);

  return Object.freeze({
    ordered:
      windowValidationIndex !== -1 &&
      verifiedSuccessIndex !== -1 &&
      windowValidationIndex < verifiedSuccessIndex,
  });
}

export const INBOUND_AUTHENTICATION_EVIDENCE_WINDOW_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-471",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication evidence window validation precedes verified success",
    description:
      "The V14.0w authentication verifier evaluator must validate the evidence validity window before returning a canonicalized verified: true result.",
    metadata: {
      introducedIn: "V14.0w",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-470"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationEvidenceWindowValidationGateInvariant(source);

      const details = result.ordered
        ? []
        : [`${FILE} -> invalid evidence window validation gate ordering`];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

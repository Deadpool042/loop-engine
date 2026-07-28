import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";

const REQUIRED = Object.freeze([
  "isInvalidAuthenticationEvidenceWindow(descriptors.evidence.value)",
  "VERIFICATION_INVALID",
]);

export function inspectInboundAuthenticationEvidenceWindowValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_EVIDENCE_WINDOW_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-470",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication evidence validity window is validated by the verifier evaluator",
    description:
      "The V14.0w authentication verifier evaluator must reject evidence whose validFrom is after expiresAt before canonicalizing a verified success.",
    metadata: {
      introducedIn: "V14.0w",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-469"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationEvidenceWindowValidationInvariant(source);
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

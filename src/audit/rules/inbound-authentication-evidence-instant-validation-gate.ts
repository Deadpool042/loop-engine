import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const VERIFICATION_FILE =
  "src/inbound-security/authentication-verification.ts";
const VALIDATION_CALL =
  "isInvalidAuthenticationEvidenceWindow(descriptors.evidence.value)";
const SUCCESS_RETURN = "return Object.freeze({";

export function inspectInboundAuthenticationEvidenceInstantValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const validationIndex = source.indexOf(VALIDATION_CALL);
  const successIndex = source.indexOf(SUCCESS_RETURN, validationIndex + 1);

  return Object.freeze({
    ordered:
      validationIndex !== -1 &&
      successIndex !== -1 &&
      validationIndex < successIndex,
  });
}

export const INBOUND_AUTHENTICATION_EVIDENCE_INSTANT_VALIDATION_GATE_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-491",
      category: "architecture",
      severity: "error",
      title:
        "Inbound authentication evidence instant validation precedes successful canonicalization",
      description:
        "The V14.1h verifier boundary must validate the evidence validity window, including instant parseability, before returning a successful canonicalized result.",
      metadata: {
        introducedIn: "V14.1h",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-490"],
      },
      check: () => {
        const source = existsSync(VERIFICATION_FILE)
          ? readFileSync(VERIFICATION_FILE, "utf8")
          : "";
        const result =
          inspectInboundAuthenticationEvidenceInstantValidationGateInvariant(
            source,
          );
        const details = result.ordered
          ? []
          : [
              `${VERIFICATION_FILE} -> invalid evidence instant validation gate ordering`,
            ];

        return details.length > 0
          ? fail(rule, `${rule.title}.`, details)
          : pass(
              rule,
              `${rule.title}.`,
              Object.freeze([VERIFICATION_FILE]),
            );
      },
    };

    return rule;
  })();

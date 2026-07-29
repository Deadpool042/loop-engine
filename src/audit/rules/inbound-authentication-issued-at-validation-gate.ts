import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";
const WINDOW_VALIDATION =
  "isInvalidAuthenticationEvidenceWindow(descriptors.evidence.value)";
const SUCCESS_RETURN = "return Object.freeze({";

export function inspectInboundAuthenticationIssuedAtValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; validationCallCount: number }> {
  const validationIndex = source.indexOf(WINDOW_VALIDATION);
  const successIndex = source.indexOf(SUCCESS_RETURN, validationIndex + 1);

  return Object.freeze({
    ordered:
      validationIndex !== -1 &&
      successIndex !== -1 &&
      validationIndex < successIndex,
    validationCallCount: source.split(WINDOW_VALIDATION).length - 1,
  });
}

export const INBOUND_AUTHENTICATION_ISSUED_AT_VALIDATION_GATE_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-493",
      category: "architecture",
      severity: "error",
      title:
        "Inbound authentication issuedAt validation precedes successful canonicalization",
      description:
        "The V14.1i authentication boundary must run evidence instant validation before returning a successful verifier result.",
      metadata: {
        introducedIn: "V14.1i",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-492"],
      },
      check: () => {
        const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
        const result =
          inspectInboundAuthenticationIssuedAtValidationGateInvariant(source);
        const details = [
          ...(result.ordered
            ? []
            : [`${FILE} -> invalid issuedAt validation gate ordering`]),
          ...(result.validationCallCount === 1
            ? []
            : [
                `${FILE} -> evidence instant validation call count: ${result.validationCallCount}`,
              ]),
        ];

        return details.length > 0
          ? fail(rule, `${rule.title}.`, details)
          : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
      },
    };

    return rule;
  })();

import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";

const ISSUER_HINT_VALIDATION = "!isNonEmptyString(descriptors.issuerHint.value)";
const SUBJECT_HINT_VALIDATION =
  "!isNonEmptyString(descriptors.subjectHint.value)";
const VERIFY_INVOCATION = "Reflect.apply(verify, verifier, [input, context])";

export function inspectInboundAuthenticationHintValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; verifyInvocationCount: number }> {
  const issuerHintValidationIndex = source.indexOf(ISSUER_HINT_VALIDATION);
  const subjectHintValidationIndex = source.indexOf(SUBJECT_HINT_VALIDATION);
  const verifyInvocationIndex = source.indexOf(VERIFY_INVOCATION);

  return Object.freeze({
    ordered:
      issuerHintValidationIndex !== -1 &&
      subjectHintValidationIndex !== -1 &&
      verifyInvocationIndex !== -1 &&
      issuerHintValidationIndex < verifyInvocationIndex &&
      subjectHintValidationIndex < verifyInvocationIndex,
    verifyInvocationCount: source.split(VERIFY_INVOCATION).length - 1,
  });
}

export const INBOUND_AUTHENTICATION_HINT_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-481",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication hint validation precedes verifier invocation",
    description:
      "The V14.1c authentication input guard must validate issuerHint and subjectHint before invoking the injected verifier, and must invoke it exactly once.",
    metadata: {
      introducedIn: "V14.1c",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-480"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationHintValidationGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid authentication hint validation gate ordering`]),
        ...(result.verifyInvocationCount === 1
          ? []
          : [`${FILE} -> verify invocation count: ${result.verifyInvocationCount}`]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

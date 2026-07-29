import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";

const INPUT_GUARD =
  "if (!isValidAuthenticationInput(input) || !isValidVerificationContext(context))";
const VERIFY_INVOCATION = "Reflect.apply(verify, verifier, [input, context])";
const CANONICALIZATION = "return canonicalizeVerifierResult(result);";
const METADATA_VALIDATION =
  "isNonEmptyStringRecord(descriptors.metadata.value)";

export function inspectInboundAuthenticationMetadataValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; validationCallCount: number }> {
  const inputGuardIndex = source.indexOf(INPUT_GUARD);
  const verifyInvocationIndex = source.indexOf(VERIFY_INVOCATION);
  const canonicalizationIndex = source.indexOf(CANONICALIZATION);

  return Object.freeze({
    ordered:
      inputGuardIndex !== -1 &&
      verifyInvocationIndex !== -1 &&
      canonicalizationIndex !== -1 &&
      inputGuardIndex < verifyInvocationIndex &&
      verifyInvocationIndex < canonicalizationIndex,
    validationCallCount: source.split(METADATA_VALIDATION).length - 1,
  });
}

export const INBOUND_AUTHENTICATION_METADATA_VALIDATION_GATE_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-489",
      category: "architecture",
      severity: "error",
      title:
        "Inbound authentication metadata validation brackets verifier execution",
      description:
        "The V14.1g authentication boundary must validate input metadata before invoking the verifier and validate evidence metadata while canonicalizing the verifier result before it can reach Core.",
      metadata: {
        introducedIn: "V14.1g",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-488"],
      },
      check: () => {
        const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
        const result =
          inspectInboundAuthenticationMetadataValidationGateInvariant(source);

        const details = [
          ...(result.ordered
            ? []
            : [`${FILE} -> invalid authentication metadata gate ordering`]),
          ...(result.validationCallCount === 2
            ? []
            : [
                `${FILE} -> metadata validation call count: ${result.validationCallCount}`,
              ]),
        ];

        return details.length > 0
          ? fail(rule, `${rule.title}.`, details)
          : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
      },
    };

    return rule;
  })();

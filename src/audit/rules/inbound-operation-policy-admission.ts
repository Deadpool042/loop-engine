import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const CORE_FILE = "src/core/inbound-authentication.ts";
const EVALUATION_FILE = "src/inbound-security/evaluation.ts";
const VALIDATION_FILE = "src/inbound-security/validation.ts";

const SHARED_PREDICATE = "export function isInboundOperationAllowed(";
const CORE_USAGE = "isInboundOperationAllowed(";
const RAW_INLINE_CHECK = "policy.allowedOperations.includes(";

export function inspectInboundOperationPolicyAdmissionInvariant(
  validationSource: string,
  coreSource: string,
  evaluationSource: string,
): Readonly<{ missing: readonly string[] }> {
  const missing: string[] = [];

  if (!sourceIncludesToken(validationSource, SHARED_PREDICATE)) {
    missing.push(`${VALIDATION_FILE} -> missing: ${SHARED_PREDICATE}`);
  }

  if (!sourceIncludesToken(coreSource, CORE_USAGE)) {
    missing.push(`${CORE_FILE} -> missing: ${CORE_USAGE}`);
  }

  if (!sourceIncludesToken(evaluationSource, CORE_USAGE)) {
    missing.push(`${EVALUATION_FILE} -> missing: ${CORE_USAGE}`);
  }

  if (sourceIncludesToken(coreSource, RAW_INLINE_CHECK)) {
    missing.push(`${CORE_FILE} -> duplicated inline check: ${RAW_INLINE_CHECK}`);
  }

  if (sourceIncludesToken(evaluationSource, RAW_INLINE_CHECK)) {
    missing.push(
      `${EVALUATION_FILE} -> duplicated inline check: ${RAW_INLINE_CHECK}`,
    );
  }

  return Object.freeze({ missing: Object.freeze(missing) });
}

export const INBOUND_OPERATION_POLICY_ADMISSION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-452",
    category: "architecture",
    severity: "error",
    title: "Inbound operation policy admission stays explicit and shared",
    description:
      "The V14.0n authentication boundary and the inbound security evaluator must both gate the requested operation through the shared, pure isInboundOperationAllowed predicate, with no duplicated inline allowedOperations check.",
    metadata: {
      introducedIn: "V14.0n",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-451"],
    },
    check: () => {
      const validationSource = existsSync(VALIDATION_FILE)
        ? readFileSync(VALIDATION_FILE, "utf8")
        : "";
      const coreSource = existsSync(CORE_FILE)
        ? readFileSync(CORE_FILE, "utf8")
        : "";
      const evaluationSource = existsSync(EVALUATION_FILE)
        ? readFileSync(EVALUATION_FILE, "utf8")
        : "";

      const result = inspectInboundOperationPolicyAdmissionInvariant(
        validationSource,
        coreSource,
        evaluationSource,
      );

      return result.missing.length > 0
        ? fail(rule, `${rule.title}.`, result.missing)
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([CORE_FILE, EVALUATION_FILE, VALIDATION_FILE]),
          );
    },
  };

  return rule;
})();

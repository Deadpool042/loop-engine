import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.authenticationInput.subjectHint !== null",
  "input.authenticationInput.subjectHint !== verification.evidence.subjectId",
  '"verification_invalid"',
]);

export function inspectInboundAuthenticationSubjectBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_SUBJECT_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-484",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication subject hint is bound to the verified evidence subjectId",
    description:
      "The V14.1e authentication boundary must reject a non-null authenticationInput.subjectHint that does not exactly match the verified evidence.subjectId.",
    metadata: {
      introducedIn: "V14.1e",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-483"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundAuthenticationSubjectBindingInvariant(source);
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

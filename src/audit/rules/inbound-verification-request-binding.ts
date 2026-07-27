import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "input.verificationContext.requestId !== input.security.accessRequest.requestId",
  '"request_id_mismatch"',
]);

export function inspectInboundVerificationRequestBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_VERIFICATION_REQUEST_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-464",
    category: "architecture",
    severity: "error",
    title: "Inbound verification request identity stays bound to the access request",
    description:
      "The V14.0t authentication boundary must reject a mismatch between verificationContext.requestId and accessRequest.requestId before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0t",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-463"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundVerificationRequestBindingInvariant(source);
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

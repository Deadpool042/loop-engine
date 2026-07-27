import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "replayEvidence.evidenceId",
  "verification.evidence.evidenceId",
  '"replay_rejected"',
]);

export function inspectInboundReplayEvidenceBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_EVIDENCE_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-440",
    category: "architecture",
    severity: "error",
    title: "Inbound replay evidence stays bound to authentication evidence",
    description:
      "The V14.0h authentication boundary must fail closed when replay evidence is not bound to the successfully verified authentication evidence.",
    metadata: {
      introducedIn: "V14.0h",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-439"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayEvidenceBindingInvariant(source);
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

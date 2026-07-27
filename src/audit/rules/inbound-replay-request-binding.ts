import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "replayEvidence.requestId !== input.security.accessRequest.requestId",
  '"replay_rejected"',
]);

export function inspectInboundReplayRequestBindingInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_REQUEST_BINDING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-454",
    category: "architecture",
    severity: "error",
    title: "Inbound replay evidence stays bound to the authenticated request",
    description:
      "The V14.0o authentication boundary must reject replay evidence whose requestId disagrees with the authenticated inbound access request.",
    metadata: {
      introducedIn: "V14.0o",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-453"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayRequestBindingInvariant(source);
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

import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "if (replayEvidence.replayed) {",
  '"replay_rejected"',
]);

export function inspectInboundReplayStateRejectionInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_STATE_REJECTION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-456",
    category: "architecture",
    severity: "error",
    title: "Inbound replay evidence already marked replayed is rejected locally",
    description:
      "The V14.0p authentication boundary must reject replay evidence whose replayed flag is already true before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0p",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-455"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayStateRejectionInvariant(source);
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

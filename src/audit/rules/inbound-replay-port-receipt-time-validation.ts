import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "isInstantAfter(replay.receivedAt, input.evaluatedAt)",
  '"replay_rejected"',
]);

export function inspectInboundReplayPortReceiptTimeValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-462",
    category: "architecture",
    severity: "error",
    title: "Inbound replay port receipt time is validated against evaluation time",
    description:
      "The V14.0s authentication boundary must reject an accepted replay-protection port result whose receivedAt is after the explicit evaluatedAt instant.",
    metadata: {
      introducedIn: "V14.0s",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-461"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayPortReceiptTimeValidationInvariant(source);
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

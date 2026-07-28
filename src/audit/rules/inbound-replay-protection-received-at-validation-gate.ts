import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const RECEIVED_AT_VALIDATION =
  "isInvalidReplayProtectionReceivedAt(replay.receivedAt)";
const PORT_RECEIPT_TIME_COMPARISON =
  "isInstantAfter(replay.receivedAt, input.evaluatedAt)";

export function inspectInboundReplayProtectionReceivedAtValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const receivedAtValidationIndex = source.indexOf(RECEIVED_AT_VALIDATION);
  const portReceiptTimeComparisonIndex = source.indexOf(
    PORT_RECEIPT_TIME_COMPARISON,
  );

  return Object.freeze({
    ordered:
      receivedAtValidationIndex !== -1 &&
      portReceiptTimeComparisonIndex !== -1 &&
      receivedAtValidationIndex < portReceiptTimeComparisonIndex,
  });
}

export const INBOUND_REPLAY_PROTECTION_RECEIVED_AT_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-479",
    category: "architecture",
    severity: "error",
    title:
      "Inbound replay-protection receivedAt validation precedes the port receipt-time comparison",
    description:
      "The V14.1a authentication boundary must validate that the replay-protection port's receivedAt is a well-formed instant before comparing it against evaluatedAt.",
    metadata: {
      introducedIn: "V14.1a",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-478"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundReplayProtectionReceivedAtValidationGateInvariant(
          source,
        );

      const details = result.ordered
        ? []
        : [
            `${FILE} -> invalid replay-protection receivedAt validation gate ordering`,
          ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const RECEIVED_AT_VALIDATION = "isInvalidReplayReceivedAt(replayEvidence)";
const RECEIPT_TIME_VALIDATION =
  "isReplayReceiptTimeAfterEvaluation(replayEvidence, input.evaluatedAt)";

export function inspectInboundReplayReceivedAtValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const receivedAtValidationIndex = source.indexOf(RECEIVED_AT_VALIDATION);
  const receiptTimeValidationIndex = source.indexOf(RECEIPT_TIME_VALIDATION);

  return Object.freeze({
    ordered:
      receivedAtValidationIndex !== -1 &&
      receiptTimeValidationIndex !== -1 &&
      receivedAtValidationIndex < receiptTimeValidationIndex,
  });
}

export const INBOUND_REPLAY_RECEIVED_AT_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-473",
    category: "architecture",
    severity: "error",
    title: "Inbound replay receivedAt validation precedes replay receipt-time comparison",
    description:
      "The V14.0x authentication boundary must validate that replay evidence receivedAt is a well-formed instant before comparing it against the evaluation instant.",
    metadata: {
      introducedIn: "V14.0x",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-472"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundReplayReceivedAtValidationGateInvariant(source);

      const details = result.ordered
        ? []
        : [`${FILE} -> invalid replay receivedAt validation gate ordering`];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

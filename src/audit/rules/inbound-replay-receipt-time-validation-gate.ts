import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const RECEIPT_TIME_VALIDATION =
  "isReplayReceiptTimeAfterEvaluation(replayEvidence, input.evaluatedAt)";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundReplayReceiptTimeValidationGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const receiptTimeValidationIndex = source.indexOf(RECEIPT_TIME_VALIDATION);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      receiptTimeValidationIndex !== -1 &&
      replayIndex !== -1 &&
      receiptTimeValidationIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_RECEIPT_TIME_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-461",
    category: "architecture",
    severity: "error",
    title: "Inbound replay receipt-time validation precedes replay protection",
    description:
      "The V14.0r authentication boundary must validate replay evidence receipt time before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0r",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-460"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayReceiptTimeValidationGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid replay receipt-time validation gate ordering`]),
        ...(result.replayCallCount === 1
          ? []
          : [`${FILE} -> replay call count: ${result.replayCallCount}`]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();

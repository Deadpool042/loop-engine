import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REPLAY = "evaluateInboundReplayProtection(";
const PORT_RECEIPT_TIME_VALIDATION =
  "isInstantAfter(replay.receivedAt, input.evaluatedAt)";

export function inspectInboundReplayPortReceiptTimeValidationGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const replayIndex = source.indexOf(REPLAY);
  const portReceiptTimeValidationIndex = source.indexOf(
    PORT_RECEIPT_TIME_VALIDATION,
  );

  return Object.freeze({
    ordered:
      replayIndex !== -1 &&
      portReceiptTimeValidationIndex !== -1 &&
      replayIndex < portReceiptTimeValidationIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-463",
    category: "architecture",
    severity: "error",
    title: "Inbound replay port receipt-time validation follows replay protection",
    description:
      "The V14.0s authentication boundary must validate the replay-protection port's receipt time after invoking the port, and must invoke the port exactly once.",
    metadata: {
      introducedIn: "V14.0s",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-462"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundReplayPortReceiptTimeValidationGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [
              `${FILE} -> invalid replay port receipt-time validation gate ordering`,
            ]),
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

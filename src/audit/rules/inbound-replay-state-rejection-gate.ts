import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const STATE_REJECTION = "if (replayEvidence.replayed) {";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundReplayStateRejectionGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const stateRejectionIndex = source.indexOf(STATE_REJECTION);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      stateRejectionIndex !== -1 &&
      replayIndex !== -1 &&
      stateRejectionIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_STATE_REJECTION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-457",
    category: "architecture",
    severity: "error",
    title: "Inbound replay state rejection precedes replay protection",
    description:
      "The V14.0p authentication boundary must reject replay evidence already marked replayed before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0p",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-456"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayStateRejectionGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid replay state rejection gate ordering`]),
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

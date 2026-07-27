import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const NOT_YET_VALID = "isEvidenceNotYetValid(";
const EXPIRED = "isEvidenceExpired(";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundAuthEvidenceValidityGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const notYetValidIndex = source.indexOf(NOT_YET_VALID);
  const expiredIndex = source.indexOf(EXPIRED);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      notYetValidIndex !== -1 &&
      expiredIndex !== -1 &&
      replayIndex !== -1 &&
      notYetValidIndex < replayIndex &&
      expiredIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_AUTH_EVIDENCE_VALIDITY_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-447",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication evidence validity precedes replay protection",
    description:
      "The V14.0k authentication boundary must reject temporally invalid authentication evidence before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0k",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-446"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthEvidenceValidityGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid authentication evidence validity ordering`]),
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

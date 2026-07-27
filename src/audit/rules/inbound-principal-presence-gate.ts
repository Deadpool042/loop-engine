import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const PRESENCE = "principal === null";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundPrincipalPresenceGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; replayCallCount: number }> {
  const presenceIndex = source.indexOf(PRESENCE);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      presenceIndex !== -1 &&
      replayIndex !== -1 &&
      presenceIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_PRINCIPAL_PRESENCE_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-445",
    category: "architecture",
    severity: "error",
    title: "Inbound principal presence precedes replay protection",
    description:
      "The V14.0j authentication boundary must reject missing principal evidence before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0j",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-444"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundPrincipalPresenceGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid principal presence gate ordering`]),
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

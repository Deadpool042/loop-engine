import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const BINDING =
  "replayEvidence.evidenceId !== verification.evidence.evidenceId";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundReplayEvidenceBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; replayCallCount: number }> {
  const bindingIndex = source.indexOf(BINDING);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      bindingIndex !== -1 &&
      replayIndex !== -1 &&
      bindingIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_EVIDENCE_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-441",
    category: "architecture",
    severity: "error",
    title: "Inbound replay evidence binding precedes replay protection",
    description:
      "The V14.0h authentication boundary must reject mismatched replay evidence before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0h",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-440"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayEvidenceBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid replay evidence binding gate ordering`]),
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

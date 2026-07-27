import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const BINDING =
  "principal.principalId !== verification.evidence.subjectId";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundPrincipalBindingGateInvariant(
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

export const INBOUND_PRINCIPAL_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-443",
    category: "architecture",
    severity: "error",
    title: "Inbound principal binding precedes replay protection",
    description:
      "The V14.0i authentication boundary must reject principal mismatch before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0i",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-442"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundPrincipalBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid principal binding gate ordering`]),
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

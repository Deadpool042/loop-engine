import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const PROJECT_BINDING =
  "input.security.accessRequest.project !== decoded.request.project";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundProjectBindingGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const projectBindingIndex = source.indexOf(PROJECT_BINDING);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      projectBindingIndex !== -1 &&
      replayIndex !== -1 &&
      projectBindingIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_PROJECT_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-459",
    category: "architecture",
    severity: "error",
    title: "Inbound project binding precedes replay protection",
    description:
      "The V14.0q authentication boundary must bind the requested project before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0q",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-458"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundProjectBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid project binding gate ordering`]),
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
